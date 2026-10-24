const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;

dotenv.config({
  path: require("path").join(__dirname, ".env"),
});

const postRoutes = require("./routes/postRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from the .env file.");
}

app.use(
  session({
    name: "instagram.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
      ttl: 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: false, // Local HTTP development only
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// API routes
app.use("/api/posts", postRoutes);
app.use("/api/auth", authRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({ message: "Instagram backend is running!" });
});

// MongoDB connection
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

startServer();