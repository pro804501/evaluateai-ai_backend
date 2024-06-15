import mongoose from "mongoose";

const ShopItemSchema = new mongoose.Schema(
    {
        enable: {
            type: Boolean,
            required: true,
        },
        title: {
            type: String,
            required: true
        },
        evaluatorLimit: {
            type: Number,
            required: true,
        },
        evaluationLimit: {
            type: Number,
            required: true,
        },
        price: {
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const ShopItem = mongoose.model("ShopItem", ShopItemSchema);

export default ShopItem;