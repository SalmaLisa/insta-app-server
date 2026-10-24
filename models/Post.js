const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    // Owner of this post
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Temporarily allows existing posts without an owner
      index: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      default: "",
    },
    initial: {
      type: String,
      default: "",
    },
    caption: {
      type: String,
      default: "",
      maxlength: 2200,
    },
    media: {
      type: [mediaSchema],
      validate: {
        validator: (items) =>
          items.length >= 1 && items.length <= 5,
        message: "A post must contain between 1 and 5 media items.",
      },
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    comments: [
      {
        username: {
          type: String,
          required: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", postSchema);