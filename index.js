// index.js
const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
const cookie = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cron = require("node-cron");

dotenv.config();

// Port
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(cookie());
app.use(express.json());

// Mongo URI
const uri = process.env.MONGODB_URI;

// Mongo Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Server is running - rice_agency");
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

async function run() {
  try {
    // Connect to MongoDB first
    await client.connect();
    const db = client.db("rice_agency");

    const usersCollection = db.collection("users");
    const ordersCollection = db.collection("orders");
    const productsCollection = db.collection("products");
    const customerCollection = db.collection("customers");
    const notificationsCollection = db.collection("notifications");

    console.log("MongoDB connected successfully!");

    // ------------------- API ROUTES -------------------

    // Users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const result = await usersCollection.insertOne(req.body);
      res.send(result);
    });

    // Products
    app.get("/products", async (req, res) => {
      const result = await productsCollection.find().toArray();
      res.send(result);
    });
    app.post("/products", async (req, res) => {
      const result = await productsCollection.insertOne(req.body);
      res.send(result);
    });

    // Customers
    app.get("/customers", async (req, res) => {
      const result = await customerCollection.find().toArray();
      res.send(result);
    });
    app.post("/customers", async (req, res) => {
      const result = await customerCollection.insertOne(req.body);
      res.send(result);
    });
    app.put("/customers/lastOrder/:customerID", async (req, res) => {
      const customerID = parseInt(req.params.customerID);
      const { lastOrder } = req.body;
      try {
        const result = await customerCollection.updateOne(
          { customerID },
          { $set: { lastOrder } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update last order" });
      }
    });

    // Orders
    app.post("/orders", async (req, res) => {
      const result = await ordersCollection.insertOne(req.body);
      res.send(result);
    });

    // Notifications
    app.get("/notifications", async (req, res) => {
      try {
        const notifications = await notificationsCollection.find().toArray();
        res.send(notifications);
      } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).send({ error: "Failed to fetch notifications" });
      }
    });

    // ------------------- CRON JOB -------------------
    // For testing: run every minute. Change to '0 0 * * *' for daily at midnight.
    cron.schedule(
      "*/3 * * * *",
      async () => {
        try {
          const today = todayInBangladesh();
          console.log(`[CRON] Checking orders for BD date: ${today} (Asia/Dhaka)`);

          // fetch only orders that have a futureOrderDate field to minimize data
          const cursor = ordersCollection.find({ futureOrderDate: { $exists: true } });
          const notificationsToInsert = [];

          while (await cursor.hasNext()) {
            const order = await cursor.next();

            const normalized = normalizeFutureDate(order.futureOrderDate);
            console.log(`[CRON] Order ${order._id} futureOrderDate (normalized): ${normalized}`);

            if (normalized === today) {
              // check if notification already exists for this customer/date
              const exists = await notificationsCollection.findOne({
                customerID: order.customerID,
                date: today,
                // optionally productName to avoid duplicates per product:
                productName: order.productName,
              });

              if (!exists) {
                notificationsToInsert.push({
                  customerID: order.customerID,
                  customerName: order.customerName,
                  productName: order.productName || null,
                  message: `${order.customerName} new product this month`,
                  date: today,
                  createdAt: new Date(),
                });
              } else {
                console.log(`[CRON] Notification already exists for customer ${order.customerID} product ${order.productName} on ${today}`);
              }
            }
          }

          if (notificationsToInsert.length > 0) {
            const r = await notificationsCollection.insertMany(notificationsToInsert);
            console.log(`[CRON] Inserted ${r.insertedCount} notifications:`, notificationsToInsert);
          } else {
            console.log("[CRON] No new notifications to insert.");
          }
        } catch (err) {
          console.error("[CRON] Error:", err);
        }
      },
      { timezone: "Asia/Dhaka" } // node-cron will trigger according to this timezone
    );

    // ------------------- END CRON JOB -------------------
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}

run().catch(console.dir);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
