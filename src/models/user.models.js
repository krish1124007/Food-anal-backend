import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const MicroNutrientsSchema = new mongoose.Schema({
  // --- Vitamins ---
  vitaminA: { type: Number, default: 0 },            // Retinol + Beta-carotene
  vitaminB1: { type: Number, default: 0 },            // Thiamine
  vitaminB2: { type: Number, default: 0 },            // Riboflavin
  vitaminB3: { type: Number, default: 0 },            // Niacin
  vitaminB5: { type: Number, default: 0 },            // Pantothenic Acid
  vitaminB6: { type: Number, default: 0 },            // Pyridoxine
  vitaminB7: { type: Number, default: 0 },            // Biotin
  vitaminB9: { type: Number, default: 0 },            // Folate
  vitaminB12: { type: Number, default: 0 },           // Cobalamin
  vitaminC: { type: Number, default: 0 },
  vitaminD: { type: Number, default: 0 },
  vitaminE: { type: Number, default: 0 },
  vitaminK: { type: Number, default: 0 },

  // --- Minerals & Electrolytes ---
  calcium: { type: Number, default: 0 },
  iron: { type: Number, default: 0 },
  magnesium: { type: Number, default: 0 },
  phosphorus: { type: Number, default: 0 },
  potassium: { type: Number, default: 0 },
  sodium: { type: Number, default: 0 },
  zinc: { type: Number, default: 0 },
  copper: { type: Number, default: 0 },
  manganese: { type: Number, default: 0 },
  selenium: { type: Number, default: 0 },
  iodine: { type: Number, default: 0 },
  chromium: { type: Number, default: 0 },
  fluoride: { type: Number, default: 0 },
  molybdenum: { type: Number, default: 0 },

  // --- Fatty Acids ---
  omega3: { type: Number, default: 0 },
  omega6: { type: Number, default: 0 },

  // --- Amino Acids (Essentials) ---
  leucine: { type: Number, default: 0 },
  isoleucine: { type: Number, default: 0 },
  valine: { type: Number, default: 0 },
  lysine: { type: Number, default: 0 },
  methionine: { type: Number, default: 0 },
  phenylalanine: { type: Number, default: 0 },
  threonine: { type: Number, default: 0 },
  tryptophan: { type: Number, default: 0 },
  histidine: { type: Number, default: 0 }
});


const intakeHistorySchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number,
    sugar: Number,
    fiber: Number,

    micronutrients: MicroNutrientsSchema,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    age: { type: Number, required: true },
    gender: { type: String, enum: ["male", "female", "other"], required: true },

    height: { type: Number, required: true }, // cm
    weight: { type: Number, required: true }, // kg
    scan_limit:{type:Number , default:5},

    activityLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    illnesses: [
      {
        type: String,
        enum: [
          "diabetes",
          "blood_pressure",
          "cholesterol",
          "thyroid",
          "kidney",
          "heart",
          "none",
        ],
        default: "none",
      },
    ],

    goals: {
      type: String,
      enum: ["weight_loss", "weight_gain", "muscle_gain", "healthy_life"],
      default: "healthy_life",
    },

    // 🔥 User's daily limits (auto-calculated based on health + AI)
    dailyLimits: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fat: { type: Number, default: 0 },
      sugar: { type: Number, default: 0 },
      fiber: { type: Number, default: 0 },

      micronutrients: {
        type: MicroNutrientsSchema,
        default: () => ({})
      },
    },

    // 🔥 Nutrition intake history (AI learns from this)
    nutritionHistory: {
      type: [intakeHistorySchema],
      default: []
    },

    // AI meal plans stored here
    dietPlans: [
      {
        generatedAt: { type: Date, default: Date.now },
        plan: Object,
      },
    ],

    plan: [
      {
        subscribe: {
          type: Boolean,
          required: false,
          default: false
        },
        plan_duration: {
          type: String,
          required: false,
          default: "0"
        },
        exp_date: {
          type: String,
          required: false,
        }
      }
    ]
  },
  { timestamps: true }
);


userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
})

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
}

userSchema.methods.generateToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
}

export const User = mongoose.model("User", userSchema);
