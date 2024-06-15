import mongoose from "mongoose";

const PaymentMethodSchema = new mongoose.Schema(
    {
        razorpay: {
            type: Boolean,
            required: true
        },
        stripe: {
            type: Boolean,
            required: true
        },
        paypal: {
            type: Boolean,
            required: true
        },
    },
    {
        timestamps: true,
    }
);

const PaymentMethod = mongoose.model("PaymentMethod", PaymentMethodSchema);

export default PaymentMethod;