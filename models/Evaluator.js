import mongoose from "mongoose";

const EvaluatorSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.ObjectId,
            required: true,
        },
        classId: {
            type: mongoose.Schema.ObjectId,
            required: true,
        },
        title: {
            type: String,
            required: true
        },
        questionPapers: {
            type: Array,
            required: true,
        },
        answerKeys: {
            type: Array,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const Evaluator = mongoose.model("Evaluator", EvaluatorSchema);

export default Evaluator;