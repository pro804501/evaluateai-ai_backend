import mongoose from "mongoose";

const InvoiceSchema = new mongoose.Schema(
    {
        purchaseId: {
            type: mongoose.Schema.ObjectId,
            required: true
        },
        userId: {
            type: mongoose.Schema.ObjectId,
            required: true
        },
        date: {
            type: String,
            required: true
        },
        item: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true,
        },
        paymentMethod: {
            type: String,
            required: true,
        },
        to: {
            name: {
                type: String,
                required: true,
            },
            email: {
                type: String,
                required: true,
            },
        },
        from: {
            name: {
                type: String,
                required: true,
            },
            email: {
                type: String,
                required: true,
            },
        },
    },
    { timestamps: true }
);

const Invoice = mongoose.model("Invoice", InvoiceSchema);

export default Invoice;