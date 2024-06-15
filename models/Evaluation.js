import mongoose from "mongoose";

const EvaluationSchema = new mongoose.Schema(
    {
        evaluatorId: {
            type: mongoose.Schema.ObjectId,
            required: true,
        },
        data: {
            type: Object,
            required: true,
            default: {}
        },
        answerSheets: {
            type: Array,
            required: true,
            default: []
        },
    },
    {
        timestamps: true,
    }
);

const Evaluation = mongoose.model("Evaluation", EvaluationSchema);

export default Evaluation;