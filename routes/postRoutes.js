
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const upload = require("../middleware/upload");

const router = express.Router();

// Check whether the user is logged in.
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      message: "Please log in first.",
    });
  }

  next();
};

// GET /api/posts/mine
// Fetch posts belonging to the currently logged-in user.
router.get("/mine", requireLogin, async (req, res) => {
  try {
    const posts = await Post.find({
      userId: req.session.userId,
    }).sort({ createdAt: -1 });

    return res.status(200).json(posts);
  } catch (error) {
    console.error("Fetch my posts error:", error.message);

    return res.status(500).json({
      message: "Failed to fetch your posts.",
    });
  }
});

// GET /api/posts
// Fetch all posts for the Home and Explore feeds.
router.get("/", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });

    return res.status(200).json(posts);
  } catch (error) {
    console.error("Fetch posts error:", error.message);

    return res.status(500).json({
      message: "Failed to fetch posts.",
    });
  }
});

// POST /api/posts
// Create a post owned by the logged-in user.
router.post(
  "/",
  requireLogin,
  (req, res, next) => {
    upload.array("media", 5)(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          return res.status(400).json({
            message:
              error.code === "LIMIT_FILE_SIZE"
                ? "A file exceeds the 50 MB upload limit."
                : "Upload failed. You can upload up to 5 files.",
          });
        }

        return res.status(400).json({
          message: error.message || "Invalid upload.",
        });
      }

      next();
    });
  },
  async (req, res) => {
    const uploadedMedia = [];

    try {
      const files = req.files || [];
      const { location, caption } = req.body;

      if (files.length < 1 || files.length > 5) {
        return res.status(400).json({
          message: "Select between 1 and 5 images or videos.",
        });
      }

      // Validate file types and sizes before uploading.
      for (const file of files) {
        if (file.mimetype.startsWith("image/")) {
          if (file.size > 10 * 1024 * 1024) {
            return res.status(400).json({
              message: "Each image must be 10 MB or smaller.",
            });
          }
        } else if (file.mimetype.startsWith("video/")) {
          if (file.size > 50 * 1024 * 1024) {
            return res.status(400).json({
              message: "Each video must be 50 MB or smaller.",
            });
          }
        } else {
          return res.status(400).json({
            message: "Unsupported media type.",
          });
        }
      }

      // Get the actual logged-in user from the database.
      const user = await User.findById(req.session.userId).select(
  "username email profilePicture"
);

      if (!user) {
        return res.status(401).json({
          message: "User not found. Please log in again.",
        });
      }

      // Upload media to Cloudinary.
      for (const file of files) {
        const resourceType = file.mimetype.startsWith("video/")
          ? "video"
          : "image";

        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "instagram-clone/posts",
              resource_type: resourceType,
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );

          stream.end(file.buffer);
        });

        uploadedMedia.push({
          url: result.secure_url,
          type: resourceType,
        });
      }

      // Never trust the post owner's username from frontend data.
     
if (!user.username) {
  return res.status(400).json({
    message: "Your account has no username. Please update your profile.",
  });
}

const post = await Post.create({
  userId: user._id,
  username: user.username,
  location: location || "",
  initial: user.username.charAt(0).toUpperCase(),
  caption: caption || "",
  media: uploadedMedia,
});


      return res.status(201).json(post);
    } catch (error) {
      console.error("Create post error:", error.message);

      // Remove uploaded Cloudinary files if post creation fails.
      await Promise.allSettled(
        uploadedMedia.map((item) => {
          const urlParts = item.url.split("/");
          const uploadIndex = urlParts.findIndex(
            (part) => part === "upload"
          );

          if (uploadIndex === -1) {
            return Promise.resolve();
          }

          const publicId = urlParts
            .slice(uploadIndex + 2)
            .join("/")
            .replace(/\.[^/.]+$/, "");

          return cloudinary.uploader.destroy(publicId, {
            resource_type: item.type,
          });
        })
      );

      return res.status(500).json({
        message: "Failed to upload media or create a post.",
      });
    }
  }
);

// DELETE /api/posts/:id
// Only the owner can delete their post.
router.delete("/:id", requireLogin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid post ID.",
      });
    }

    const post = await Post.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found or you do not have permission to delete it.",
      });
    }

    return res.status(200).json({
      message: "Post deleted successfully.",
    });
  } catch (error) {
    console.error("Delete post error:", error.message);

    return res.status(500).json({
      message: "Failed to delete the post.",
    });
  }
});

 // PUT /api/posts/:id
 // Only the owner can edit their post.
router.put("/:id", requireLogin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid post ID.",
      });
    }

    const { caption, location } = req.body;

    if (caption !== undefined && typeof caption !== "string") {
      return res.status(400).json({
        message: "Caption must be text.",
      });
    }

    if (location !== undefined && typeof location !== "string") {
      return res.status(400).json({
        message: "Location must be text.",
      });
    }

    if (caption === undefined && location === undefined) {
      return res.status(400).json({
        message: "Provide a caption or location to update.",
      });
    }

    if (caption !== undefined && caption.length > 2200) {
      return res.status(400).json({
        message: "Caption cannot exceed 2200 characters.",
      });
    }

    if (location !== undefined && location.length > 150) {
      return res.status(400).json({
        message: "Location cannot exceed 150 characters.",
      });
    }

    const updates = {};

    if (caption !== undefined) updates.caption = caption;
    if (location !== undefined) updates.location = location;

    const post = await Post.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.session.userId,
      },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!post) {
      return res.status(404).json({
        message: "Post not found or you do not have permission to edit it.",
      });
    }

    return res.status(200).json(post);
  } catch (error) {
    console.error("Edit post error:", error.message);

    return res.status(500).json({
      message: "Failed to update the post.",
    });
  }
});


module.exports = router;
