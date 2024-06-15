import mongoose from "mongoose";
import { paymentMethods } from "../utils/utils.js";

const OrderSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.ObjectId,
            required: true
        },
        itemId: {
            type: mongoose.Schema.ObjectId,
            required: true
        },
        orderId: {
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
            enum: paymentMethods
        },
    },
    { timestamps: true }
);

const Order = mongoose.model("Order", OrderSchema);

export default Order;