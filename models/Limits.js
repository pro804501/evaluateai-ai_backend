import mongoose from "mongoose";

const LimitsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.ObjectId,
            required: true,
        },
        evaluatorLimit: {
            type: Number,
            required: true,
            default: 0,
        },
        evaluationLimit: {
            type: Number,
            required: true,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

const Limits = mongoose.model("Limits", LimitsSchema);

export default Limits;