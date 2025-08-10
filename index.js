const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Firebase Admin Setup
const serviceAccount = require("./firebase-admin.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors({ origin: ["http://localhost:5173","https://ph11-assignment-11-saklain.web.app"], credentials: true }));
app.use(express.json());

// Token Verification Middleware
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not token provided" });
  }

  const idToken = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// MongoDB Connection/
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function run() {
  try {
    const db = client.db("foodShareDB");
    const foodCollection = db.collection("foods");
    const requestCollection = db.collection("foodRequests");

    // Test Route (Protected)
    app.get("/", (req, res) => {
      res.send("Welcome to the secure backend!");
    });

    // POST: Add Food
    app.post("/add-food", verifyFirebaseToken, async (req, res) => {
      const food = { ...req.body, status: "available" };
      const result = await foodCollection.insertOne(food);
      res.send(result);
    });

    // GET: Available Foods:
    app.get("/available-foods", async (req, res) => {
      const result = await foodCollection.find({ status: "available" }).toArray();
      res.send(result);
    });

    // GET: Food by ID:
    app.get("/food/:id", async (req, res) => {
      const id = req.params.id;
      const food = await foodCollection.findOne({ _id: new ObjectId(id) });
      res.send(food);
    });

    // PATCH: Update Food
    app.patch("/food/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await foodCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // DELETE: Food
    app.delete("/food/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const result = await foodCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // POST: Food Request
    app.post("/food-request", verifyFirebaseToken, async (req, res) => {
      const foodId = req.body.foodId;

      const requestData = {
        ...req.body,
        requesterEmail: req.firebaseUser.email,         
        requestDate: new Date(),                        
      };

      // Update food status to "requested"
      await foodCollection.updateOne(
        { _id: new ObjectId(foodId) },
        { $set: { status: "requested" } }
      );

      // Add request to foodRequests collection
      const result = await requestCollection.insertOne(requestData);
      res.send(result);
    });

    // GET: My Added Foods
    app.get("/my-foods", verifyFirebaseToken, async (req, res) => {
      const userEmail = req.firebaseUser.email;
      const result = await foodCollection.find({ donorEmail: userEmail }).toArray();
      res.send(result);
    });

    //GET: My Food Requests (with food info joined)
app.get("/my-requests", verifyFirebaseToken, async (req, res) => {
  const userEmail = req.firebaseUser.email;

  // Step 1: Find all requests by logged-in user
  const requests = await requestCollection
    .find({ requesterEmail: userEmail })
    .toArray();

  // Step 2: For each request, get the associated food data
  const detailedRequests = await Promise.all(
    requests.map(async (req) => {
      const food = await foodCollection.findOne({
        _id: new ObjectId(req.foodId),
      });

      return {
        _id: req._id,
        donorName: food?.donorName || "N/A",
        location: food?.location || "N/A",
        expire: food?.expire || null,
        requestDate: req.requestDate,
      };
    })
  );

  res.send(detailedRequests);
});


    console.log("MongoDB connected and routes are active");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
  }
}

run();

//Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
