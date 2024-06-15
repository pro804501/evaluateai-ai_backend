import mongoose from "mongoose";

const FaqSchema = new mongoose.Schema(
    {
        question: {
            type: String,
            required: true,
        },
        answer: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const Faq = mongoose.model("Faq", FaqSchema);

export default Faq;