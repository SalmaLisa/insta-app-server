
const multer = require("multer");

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return callback(
      new Error("Unsupported file type. Use JPG, PNG, WEBP, GIF, MP4, WEBM, or MOV.")
    );
  }

  callback(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 5,
    fileSize: 50 * 1024 * 1024,
  },
});

module.exports = upload;
