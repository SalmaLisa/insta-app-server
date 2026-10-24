
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const upload = require("../middleware/upload");

const router = express.Router();




/* POST /api/auth/register */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Username, email, and password are required.",
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[a-zA-Z0-9._]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({
        message:
          "Username must be 3–30 characters and contain only letters, numbers, dots, or underscores.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    if (
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and no more than 72 bytes.",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        {
          username: {
            $regex: `^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            $options: "i",
          },
        },
        { email: cleanEmail },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "That username or email is already registered.",
      });
    }

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      password,
    });

    req.session.regenerate((error) => {
      if (error) {
        console.error("Registration session error:", error.message);
        return res.status(500).json({
          message:
            "Account created, but automatic login failed. Please log in.",
        });
      }

      req.session.userId = user._id.toString();

      req.session.save((saveError) => {
        if (saveError) {
          console.error(
            "Registration session save error:",
            saveError.message
          );

          return res.status(500).json({
            message:
              "Account created, but automatic login failed. Please log in.",
          });
        }

        return res.status(201).json({
          message: "Registration successful.",
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            profilePicture: user.profilePicture,
            bio: user.bio,
          },
        });
      });
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "That username or email is already registered.",
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      message: "Unable to register right now.",
    });
  }
});




router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (
      typeof identifier !== "string" ||
      typeof password !== "string" ||
      !identifier.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Username/email and password are required.",
      });
    }

    const value = identifier.trim();

    const user = await User.findOne({
      $or: [
        { username: value },
        { email: value.toLowerCase() },
      ],
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Invalid username/email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid username/email or password.",
      });
    }

    // Regenerate the session after successful authentication.
    req.session.regenerate((error) => {
      if (error) {
        console.error("Session regeneration error:", error.message);
        return res.status(500).json({
          message: "Unable to create a login session.",
        });
      }

      req.session.userId = user._id.toString();

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError.message);
          return res.status(500).json({
            message: "Unable to save the login session.",
          });
        }

        return res.status(200).json({
          message: "Login successful.",
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            profilePicture: user.profilePicture,
            bio: user.bio,
          },
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Unable to log in right now.",
    });
  }
});

const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Please log in first.",
    });
  }

  next();
};

/* PUT /api/auth/profile */
router.put("/profile", requireLogin, async (req, res) => {
  try {
    const { username, bio } = req.body;

    if (typeof username !== "string" || typeof bio !== "string") {
      return res.status(400).json({
        message: "Username and bio are required.",
      });
    }

    const cleanUsername = username.trim();
    const cleanBio = bio.trim();

    if (!/^[a-zA-Z0-9._]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({
        message:
          "Username must be 3–30 characters and contain only letters, numbers, dots, or underscores.",
      });
    }

    if (cleanBio.length > 150) {
      return res.status(400).json({
        message: "Bio cannot exceed 150 characters.",
      });
    }

    const existingUser = await User.findOne({
      username: { $regex: `^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      _id: { $ne: req.session.userId },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "That username is already taken.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.session.userId,
      {
        $set: {
          username: cleanUsername,
          bio: cleanBio,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("username email profilePicture bio");

    if (!user) {
      return res.status(404).json({
        message: "User account not found.",
      });
    }

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        bio: user.bio,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "That username is already taken.",
      });
    }

    console.error("Profile update error:", error.message);

    return res.status(500).json({
      message: "Unable to update your profile.",
    });
  }
});

/* PUT /api/auth/profile-picture */
router.put(
  "/profile-picture",
  requireLogin,
  (req, res, next) => {
    upload.single("profilePicture")(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          return res.status(400).json({
            message:
              error.code === "LIMIT_FILE_SIZE"
                ? "Image exceeds the upload size limit."
                : "Image upload failed.",
          });
        }

        return res.status(400).json({
          message: error.message || "Invalid image upload.",
        });
      }

      next();
    });
  },
  async (req, res) => {
    let uploadedPublicId;

    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Please select a profile picture.",
        });
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          message: "Please upload an image file.",
        });
      }

      // Limit profile pictures to 5 MB.
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          message: "Profile pictures must be 5 MB or smaller.",
        });
      }

      const user = await User.findById(req.session.userId);

      if (!user) {
        return res.status(404).json({
          message: "User account not found.",
        });
      }

      // Upload the image to Cloudinary.
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "instagram-clone/profiles",
            resource_type: "image",
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );

        stream.end(req.file.buffer);
      });

      uploadedPublicId = result.public_id;

      // Update the user's profile picture.
      user.profilePicture = result.secure_url;
      await user.save();

      return res.status(200).json({
        message: "Profile picture updated successfully.",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture,
          bio: user.bio,
        },
      });
    } catch (error) {
      // Remove the newly uploaded image if saving fails.
      if (uploadedPublicId) {
        await cloudinary.uploader
          .destroy(uploadedPublicId, { resource_type: "image" })
          .catch(() => {});
      }

      console.error("Profile picture update error:", error.message);

      return res.status(500).json({
        message: "Failed to update profile picture.",
      });
    }
  }
);

// GET /api/auth/me
router.get("/me", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select(
      "username email profilePicture bio"
    );

    if (!user) {
      return req.session.destroy(() => {
        res.clearCookie("instagram.sid", {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
        });

        res.status(401).json({
          message: "User account not found. Please log in again.",
        });
      });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        bio: user.bio,
      },
    });
  } catch (error) {
    console.error("Current user error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve your account.",
    });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error.message);

      return res.status(500).json({
        message: "Unable to log out. Please try again.",
      });
    }

    res.clearCookie("instagram.sid", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });

    return res.status(200).json({
      message: "Logout successful.",
    });
  });
});

module.exports = router;
module.exports.requireLogin = requireLogin;
