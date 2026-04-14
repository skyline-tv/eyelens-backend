import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const refreshTokenEntrySchema = new mongoose.Schema(
  {
    jti: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema(
  {
    patientName: { type: String, default: "", trim: true, maxlength: 120 },
    date: { type: Date, default: Date.now },
    odSphere: { type: String, default: "", trim: true, maxlength: 20 },
    odCylinder: { type: String, default: "", trim: true, maxlength: 20 },
    odAxis: { type: String, default: "", trim: true, maxlength: 20 },
    osSphere: { type: String, default: "", trim: true, maxlength: 20 },
    osCylinder: { type: String, default: "", trim: true, maxlength: 20 },
    osAxis: { type: String, default: "", trim: true, maxlength: 20 },
    add: { type: String, default: "", trim: true, maxlength: 20 },
    pd: { type: String, default: "", trim: true, maxlength: 20 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name must be at most 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ["user", "admin"],
        message: "{VALUE} is not a valid role",
      },
      default: "user",
    },
    refreshTokens: {
      type: [refreshTokenEntrySchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "Too many active sessions",
      },
    },
    /** Product ids the customer saved */
    wishlist: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: [],
      validate: [(arr) => arr.length <= 200, "Wishlist limit reached"],
    },
    prescriptions: {
      type: [prescriptionSchema],
      default: [],
      validate: [(arr) => arr.length <= 50, "Prescription limit reached"],
    },
    /** SHA-256 hash of raw reset token (never store plain token) */
    resetPasswordToken: { type: String, select: false, default: null },
    resetPasswordExpires: { type: Date, select: false, default: null },
    isBanned: { type: Boolean, default: false },
    bannedAt: { type: Date, default: null },
    bannedReason: { type: String, default: "", trim: true, maxlength: 500 },
    /** Soft-delete: hidden from admin list & cannot log in */
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.addRefreshJti = function addRefreshJti(jti, expiresAt) {
  this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt > new Date());
  this.refreshTokens.push({ jti, expiresAt });
  if (this.refreshTokens.length > 10) {
    this.refreshTokens = this.refreshTokens.slice(-10);
  }
};

userSchema.methods.removeRefreshJti = function removeRefreshJti(jti) {
  this.refreshTokens = this.refreshTokens.filter((t) => t.jti !== jti);
};

userSchema.methods.hasRefreshJti = function hasRefreshJti(jti) {
  const now = new Date();
  return this.refreshTokens.some((t) => t.jti === jti && t.expiresAt > now);
};

export default mongoose.model("User", userSchema);
