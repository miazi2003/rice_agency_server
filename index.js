// index.js
const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cron = require("node-cron");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

dotenv.config();

// Port
const port = process.env.PORT || 3000;

// Middlewares
app.use(
  cors({
    origin: ["https://lucky-lily-5defea.netlify.app", "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // ✅ add this
    allowedHeaders: ["Content-Type", "Authorization"], // ✅ add this
  })
);

app.use(cookieParser());
app.use(express.json());

// Mongo URI
const uri = process.env.MONGODB_URI;

// Import mongoose models
const User = require("./models/User");
const Product = require("./models/Product");
const Order = require("./models/Order");
const Customer = require("./models/Customer");
const Notification = require("./models/Notification");

// Root endpoint
app.get("/", (req, res) => {
  res.send("Server is running - rice_agency");
});

app.get("/xyz", (req, res) => {
  User.find()
    .then((users) => res.send(users))
    .catch((err) => res.status(500).send({ error: "Failed to fetch users" }));
});

// Helper: get today's date string in Asia/Dhaka (YYYY-MM-DD)
function todayInBangladesh() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }); // en-CA => YYYY-MM-DD
}

// Helper: normalize futureOrderDate to YYYY-MM-DD in BD timezone
function normalizeFutureDate(value) {
  if (!value && value !== 0) return null;

  // If it's a Date object (from Mongo ISODate), convert using BD timezone
  if (value instanceof Date) {
    return value.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  }

  // If it's a string
  if (typeof value === "string") {
    const s = value.trim();

    // If ISO-like string with 'T', parse it to Date then convert to BD date
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s); // parse ISO
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
    }

    // If it's already YYYY-MM-DD (or YYYY-MM-DD plus time separated by space),
    // just take the date part.
    return s.split("T")[0].split(" ")[0];
  }

  // Fallback: stringify and take date part
  return String(value).trim().split("T")[0].split(" ")[0];
}

const verifyToken = (req, res, next) => {
  console.log("cookie", req.cookies);
  const token = req?.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.decoded = decoded;
    console.log(decoded);
    next();
  });
};

const verifyRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.decoded) {
      return res.status(401).send("Unauthorized");
    }
    if (req.decoded.role !== requiredRole) {
      return res.status(403).send("Forbidden - You don't have permission");
    }
    next();
  };
};

// Connect to MongoDB with mongoose
mongoose
  .connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Mongoose connected successfully!");
  })
  .catch((err) => {
    console.error("Mongoose connection error:", err);
    process.exit(1);
  });

// ----------------------JWT API-----------------
app.post("/jwt", async (req, res) => {
  const { email } = req.body;
  console.log(email, "cookked")
  const user = await User.findOne({ email });
  console.log(user)
  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }
  const token = jwt.sign(
    { email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.send({ success: true });
});

// ------------------- API ROUTES -------------------

// Users
app.get("/users/all", verifyToken, verifyRole("admin"), async (req, res) => {
  const result = await User.find();
  res.send(result);
});
app.post("/users", async (req, res) => {
  const user = new User(req.body);
  const result = await user.save();
  res.send(result);
});

app.get("/users", verifyToken, async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).send({ message: "Email query required" });
  const result = await User.findOne({ email });
  res.send(result);
});

// Products
app.get("/products", verifyToken, async (req, res) => {
  const result = await Product.find();
  res.send(result);
});
app.post("/products", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const lastProduct = await Product.findOne().sort({ productID: -1 });
    const newID = lastProduct ? lastProduct.productID + 1 : 1;

    const newProduct = new Product({
      productID: newID,
      ...req.body,
    });

    const result = await newProduct.save();

    res.send(result);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send({ message: "Failed to add product" });
  }
});

app.delete("/products/:productID", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const productID = Number(req.params.productID);
    if (Number.isNaN(productID)) {
      return res.status(400).json({ message: "Invalid productID" });
    }

    // Find and delete the product
    const deletedProduct = await Product.findOneAndDelete({ productID: productID });

    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Remove the product from all orders' products arrays
    await Order.updateMany(
      { "products.productId": productID },
      { $pull: { products: { productId: productID } } }
    );

    // Remove any orders that now have empty products array
    await Order.deleteMany({ $or: [{ products: { $exists: true, $size: 0 } }, { products: { $exists: false } }] });

    // Remove notifications that reference this product name (if productName exists)
    if (deletedProduct.productName) {
      await Notification.deleteMany({ productName: deletedProduct.productName });
    }

    res.json({
      success: true,
      message: "Product deleted and related references cleaned up",
      deletedProduct,
    });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ message: "Server error while deleting product" });
  }
});

// ------------------- UPDATE PRODUCT -------------------
app.put("/products/:productID", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const productID = Number(req.params.productID);
    if (Number.isNaN(productID)) {
      return res.status(400).json({ message: "Invalid productID" });
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { productID: productID },
      req.body,
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      updatedProduct,
    });
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ message: "Server error while updating product" });
  }
});




// Customers
app.get("/customers", verifyToken, verifyRole("admin"), async (req, res) => {
  const result = await Customer.find();
  res.send(result);
});
app.post("/customers", verifyToken, verifyRole("admin"), async (req, res) => {
  const customer = new Customer(req.body);
  const result = await customer.save();
  res.send(result);
});
app.put("/customers/lastOrder/:customerID", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const { customerID } = req.params;
    const { lastOrder } = req.body;

    const updated = await Customer.findOneAndUpdate(
      { customerID: parseInt(customerID) },
      { lastOrder },
      { new: true }
    );

    if (!updated) {
      return res.status(404).send({ message: "Customer not found" });
    }

    res.send(updated);

  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to update last order" });
  }
});


app.get(
  "/customers/:customerID",
  verifyToken,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const customerID = Number(req.params.customerID);
      const customer = await Customer.findOne({ customerID: customerID });
      if (!customer)
        return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.delete("/customers/:customerID", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const customerID = Number(req.params.customerID);
    if (Number.isNaN(customerID)) {
      return res.status(400).json({ message: "Invalid customerID" });
    }

    // Delete customer
    const deletedCustomer = await Customer.findOneAndDelete({ customerID: customerID });

    if (!deletedCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Delete orders tied to this customerID
    const deletedOrders = await Order.deleteMany({ customerID: customerID });

    // Delete notifications tied to this customerID
    const deletedNotifications = await Notification.deleteMany({ customerID: customerID });

    res.json({
      success: true,
      message: "Customer and related orders/notifications deleted",
      deletedCustomer,
      ordersRemovedCount: deletedOrders.deletedCount ?? deletedOrders, // mongoose returns an object in some versions
      notificationsRemovedCount: deletedNotifications.deletedCount ?? deletedNotifications,
    });
  } catch (err) {
    console.error("Error deleting customer:", err);
    res.status(500).json({ message: "Server error while deleting customer" });
  }
});



// ------------------- UPDATE CUSTOMER -------------------
app.put("/customers/:customerID", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const customerID = Number(req.params.customerID);
    if (Number.isNaN(customerID)) {
      return res.status(400).json({ message: "Invalid customerID" });
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
      { customerID: customerID },
      req.body,
      { new: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({
      success: true,
      message: "Customer updated successfully",
      updatedCustomer,
    });
  } catch (err) {
    console.error("Error updating customer:", err);
    res.status(500).json({ message: "Server error while updating customer" });
  }
});



// ------------------- Recommended Products API -------------------
app.get(
  "/products/recommended/:customerID",
  verifyToken,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const customerID = Number(req.params.customerID);
      if (Number.isNaN(customerID)) {
        return res.status(400).json({ message: "Invalid customerID" });
      }

      // 1️⃣ Find customer
      const customer = await Customer.findOne({ customerID });
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // 2️⃣ Get selected product IDs from customer DB
      const selectedIDs = customer.selectedProducts || [];

      // If no recommended products exist
      if (!selectedIDs.length) {
        return res.json([]);
      }

      // 3️⃣ Fetch full product data
      const products = await Product.find({ productID: { $in: selectedIDs } });

      // 4️⃣ Format clean output
      const recommended = products.map((p) => ({
        productId: p.productID,
        productName: p.name,
      }));

      res.json(recommended);
    } catch (err) {
      console.error("Error fetching recommended products:", err);
      res.status(500).json({ message: "Server error fetching recommended products" });
    }
  }
);


// Orders
// ---------------- ADD ORDER + STOCK DECREASE ----------------
app.post("/orders", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const { orderID, customerID, customerName, address, mobile, joinDate, products, orderDate, futureOrderDate } = req.body;

    if (!orderID) {
      return res.status(400).send({ message: "orderID is required" });
    }

    if (!products || products.length === 0) {
      return res.status(400).send({ message: "No products in order" });
    }

    // 1️⃣ Check stock for each product and decrement atomically
    for (const item of products) {
      const updatedProduct = await Product.findOneAndUpdate(
        { productID: item.productId, stock: { $gt: 0 } },
        { $inc: { stock: -1 } },
        { new: true }
      );

      if (!updatedProduct) {
        return res.status(400).send({
          message: `Stock unavailable for product: ${item.productName}`,
        });
      }
    }

    // 2️⃣ Save the order
  const newOrder = new Order({
  orderID,
  customerID,
  customerName,
  address,
  mobile,
  joinDate,
  products,
  orderDate,
  futureOrderDate: normalizeFutureDate(futureOrderDate) || null,
});


    const result = await newOrder.save();

    res.send({
      success: true,
      message: `Order #${orderID} added & stock updated successfully`,
      result,
    });
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).send({ message: "Failed to add order" });
  }
});
// ---------------- GET LAST ORDER ----------------
app.get("/orders/last", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    // Find the last order by orderID in descending order
    const lastOrder = await Order.findOne().sort({ orderID: -1 });

    if (!lastOrder) {
      return res.send(null); // no orders yet
    }

    res.send(lastOrder);
  } catch (err) {
    console.error("Error fetching last order:", err);
    res.status(500).send({ message: "Failed to get last order" });
  }
});


app.get("/orders", verifyToken, verifyRole("admin"), async (req, res) => {
  const result = await Order.find();
  res.send(result);
});

app.get(
  "/orders/customer/:customerID",
  verifyToken,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const customerID = Number(req.params.customerID);
      const customerOrders = await Order.find({ customerID: customerID });
      res.json(customerOrders);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.get("/products/:productID", verifyToken, async (req, res) => {
  const productID = Number(req.params.productID);
  try {
    const product = await Product.findOne({ productID: productID });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/orders/:orderId", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1️⃣ Find the order first (so we can clean related notifications)
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2️⃣ Delete the order
    await Order.findByIdAndDelete(orderId);

    // 3️⃣ Remove related notifications (best match)
    //    matches: same customerID AND same productName
    for (const p of order.products) {
      await Notification.deleteMany({
        customerID: order.customerID,
        productName: p.productName,
      });
    }

    res.json({
      success: true,
      message: "Order deleted successfully",
      deletedOrderId: orderId,
    });

  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ message: "Server error while deleting order" });
  }
});

// PUT update order by orderID
app.put("/orders/:orderID", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const { orderID } = req.params;
    const updatedData = req.body; // customerID, products, futureOrderDate, etc.

    const order = await Order.findOne({ orderID: parseInt(orderID) });
    if (!order) return res.status(404).send({ message: "Order not found" });

    // Optional: adjust stock if products changed (advanced)
    order.products = updatedData.products || order.products;
    order.futureOrderDate = updatedData.futureOrderDate || order.futureOrderDate;
    // other fields if needed
    await order.save();

    res.send({ success: true, message: "Order updated successfully", order });
  } catch (err) {
    console.error("❌ Update order error:", err);
    res.status(500).send({ message: "Failed to update order" });
  }
});
// DELETE order by orderID
app.delete("/orders/:orderID", verifyToken, verifyRole("admin"), async (req, res) => {
  try {
    const { orderID } = req.params;
    const order = await Order.findOneAndDelete({ orderID: parseInt(orderID) });
    if (!order) return res.status(404).send({ message: "Order not found" });

    // Optional: Restore stock if you reduced it on order
    for (const item of order.products) {
      const product = await Product.findOne({ productID: item.productId });
      if (product) {
        product.stock += 1; // or item.quantity if you track qty
        await product.save();
      }
    }

    res.send({ success: true, message: "Order deleted successfully" });
  } catch (err) {
    console.error("❌ Delete order error:", err);
    res.status(500).send({ message: "Failed to delete order" });
  }
});


// Notifications
app.get(
  "/notifications",
  verifyToken,
  verifyRole("admin"),
  async (req, res) => {
    try {
      const notifications = await Notification.find();
      res.send(notifications);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      res.status(500).send({ error: "Failed to fetch notifications" });
    }
  }
);

cron.schedule(
  "0 0 * * *",
  async () => {
    try {
      const today = todayInBangladesh();
      console.log(`\n🚀 [CRON] Running for BD date: ${today}`);

      // 🔥 STEP 1: FIND ONLY TODAY’S ORDERS (Fast query)
      const orders = await Order.find({
        futureOrderDate: today
      });

      console.log(`📌 Found ${orders.length} orders for today.`);

      if (orders.length === 0) {
        console.log("⛔ No orders match today's date.");
        return;
      }

      let notificationsToInsert = [];

      // 🔥 STEP 2: LOOP THROUGH EACH ORDER
      for (const order of orders) {
        console.log(`\n📝 Processing Order ID: ${order._id}`);

        // 🔥 STEP 3: LOOP THROUGH EACH PRODUCT
        for (const product of order.products || []) {
          console.log(
            `➡ Product: ${product.productName} (${product.productId})`
          );

          // Check duplicate
          const exists = await Notification.findOne({
            customerID: order.customerID,
            date: today,
            productName: product.productName
          });

          if (exists) {
            console.log(`❌ Duplicate found, skipping...`);
            continue;
          }

          // Prepare notification
          notificationsToInsert.push({
            customerID: order.customerID,
            customerName: order.customerName,
            productName: product.productName,
            message: `${order.customerName} want ${product.productName} this month`,
            date: today,
            createdAt: new Date()
          });

          console.log(`✅ Queued notification for: ${product.productName}`);
        }
      }

      // 🔥 STEP 4: BULK INSERT
      if (notificationsToInsert.length > 0) {
        await Notification.insertMany(notificationsToInsert);
        console.log(
          `🎉 Inserted ${notificationsToInsert.length} notifications.`,
          notificationsToInsert
        );
      } else {
        console.log("ℹ No new notifications to insert.");
      }

      console.log("🚀 [CRON END]\n");

    } catch (err) {
      console.error("❌ [CRON ERROR]:", err);
    }
  },
  { timezone: "Asia/Dhaka" }
);

// Start server
// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });

module.exports = app;

