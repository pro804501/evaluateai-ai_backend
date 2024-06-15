import joi from "joi";
import dotenv from "dotenv";
import crypto from "crypto";
import stripe from "stripe";
import express from "express";
import Razorpay from "razorpay";
import ShopItem from "../models/ShopItem.js";
import Order from "../models/Order.js";
import Limits from "../models/Limits.js";
import Purchase from "../models/Purchase.js";
import { validate } from "../middlewares/validate.js";
import PaymentMethod from "../models/PaymentMethod.js";
import { currency, merchantAddress, merchantName, paypalCurrency, razorpayThemeColor } from "../utils/utils.js";
import Invoice from "../models/Invoice.js";

dotenv.config();

const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const router = express.Router();
const stripeObj = stripe(process.env.STRIPE_SECRET_KEY);

//PAYPAL BASE URL
const base = "https://api-m.sandbox.paypal.com"; //sandbox
//const base = "https://api-m.paypal.com"; //live

router.get("/", async (req, res) => {
    const paymentMethod = await PaymentMethod.findOne();
    const items = await ShopItem.find();
    const paymentMethods = paymentMethod ? {
        razorpay: paymentMethod.razorpay,
        stripe: paymentMethod.stripe,
        paypal: paymentMethod.paypal,
    } : {
        razorpay: true,
        stripe: true,
        paypal: true,
    };

    const data = {
        items: items,
        paymentMethods: paymentMethods,
    }

    return res.send(data);
});

router.get("/purchases", validate, async (req, res) => {
    const purchases = (await Purchase.find({userId: req.user._id})).reverse();

    var purchasesData = [];

    for (const purchase of purchases) {
        const item = await ShopItem.findById(purchase.itemId);

        purchasesData.push({
            _id: purchase._id,
            item: item.title,
            amount: purchase.amount,
            paymentMethod: purchase.paymentMethod,
            date: purchase.createdAt.toLocaleString().split(",")[0]
        });
    }

    return res.send(purchasesData);
})

router.post("/invoice", validate, async (req, res) => {
    const schema = joi.object({
        purchaseId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const purchase = await Purchase.findById(data.purchaseId);

        if (req.user.type != 0 && req.user._id.toString() != purchase.userId.toString()) {
            return res.status(403).send("Forbidden");
        }

        return res.send(await Invoice.findOne({ purchaseId: purchase._id }));
    }
    catch (err) {
        return res.status(500).send(err);
    }
})

//CREATE ORDER (STRIPE)
router.post("/create-order-stripe", validate, async (req, res) => {
    const schema = joi.object({
        itemId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);
        const item = await ShopItem.findById(data.itemId);

        if (!item) return res.status(400).send("Invalid Item");

        const paymentIntent = await stripeObj.paymentIntents.create({
            amount: item.price * 100,
            currency: currency,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        await Order.findOneAndDelete({ userId: req.user._id });

        const newOrder = new Order({
            userId: req.user._id,
            itemId: data.itemId,
            orderId: paymentIntent.id,
            amount: item.price,
            paymentMethod: "stripe",
        });

        await newOrder.save();

        return res.send({
            orderId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
        });
    }
    catch (err) {
        return res.status(500).send(err);
    }

});

//PAYPAL ACCESS TOKEN
async function generateAccessToken() {
    const response = await fetch(base + "/v1/oauth2/token", {
        method: "post",
        body: "grant_type=client_credentials",
        headers: {
            Authorization:
                "Basic " + Buffer.from(process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET).toString("base64"),
        },
    });
    const data = await response.json();
    return data.access_token;
}

//CREATE ORDER FUNCTION (PAYPAL)
async function createOrder(price) {
    const accessToken = await generateAccessToken();
    const url = `${base}/v2/checkout/orders`;
    const response = await fetch(url, {
        method: "post",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: paypalCurrency,
                        value: price.toString(),
                    },
                },
            ],
        }),
    });
    const data = await response.json();
    return data;
}

//CREATE ORDER (PAYPAL)
router.post("/create-order-paypal", validate, async (req, res) => {
    const schema = joi.object({
        itemId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);
        const item = await ShopItem.findById(data.itemId);

        if (!item) return res.status(400).send("Invalid Item");

        //IMPLEMENT currency conversion here: item.price * conversionRate
        var conversionRate = 1;
        var convertedPrice = item.price * conversionRate;

        const order = await createOrder(convertedPrice);

        await Order.findOneAndDelete({ userId: req.user._id });

        const newOrder = new Order({
            userId: req.user._id,
            itemId: data.itemId,
            orderId: order.id,
            amount: item.price,
            paymentMethod: "paypal",
        });

        await newOrder.save();

        return res.send(order);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

//CREATE ORDER (RAZORPAY)
router.post('/create-order-razorpay', validate, async (req, res) => {
    const schema = joi.object({
        itemId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);
        const item = await ShopItem.findById(data.itemId);

        if (!item) return res.status(400).send("Invalid Item");

        const orderOptions = {
            amount: item.price * 100,
            currency: currency.toUpperCase(),
            receipt: 'order_rcptid_' + Math.random().toString(),
            payment_capture: 1,
        };

        const order = await instance.orders.create(orderOptions);

        await Order.findOneAndDelete({ userId: req.user._id });

        const newOrder = new Order({
            userId: req.user._id,
            itemId: data.itemId,
            orderId: order.id,
            amount: order.amount / 100,
            paymentMethod: "razorpay",
        });

        const orderData = await newOrder.save();

        const resData = {
            key: process.env.RAZORPAY_KEY_ID,
            amount: orderData.amount,
            currency: currency.toUpperCase(),
            name: merchantName,
            description: item.title,
            order_id: orderData.orderId,
            prefill: {
                name: req.user.name,
                email: req.user.email,
            },
            theme: {
                color: razorpayThemeColor
            }
        };

        return res.json(resData);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to create order' });
    }
});

//COMPLETE PURCHASE (STRIPE)
router.post('/verify-stripe-payment', validate, async (req, res) => {
    const { orderId } = req.body;

    const order = await Order.findOne({ orderId: orderId });

    if (!order) return res.status(400).send('Invalid Order');

    const newPurchase = new Purchase({
        userId: req.user._id,
        itemId: order.itemId,
        transactionId: orderId,
        paymentMethod: "stripe",
        amount: order.amount,
    });

    const item = await ShopItem.findById(order.itemId);

    await Limits.findOneAndUpdate({ userId: req.user._id }, { $inc: { evaluatorLimit: item.evaluatorLimit, evaluationLimit: item.evaluationLimit } });

    await newPurchase.save();
    await Order.findOneAndDelete({ orderId: orderId });

    const newInvoice = new Invoice({
        purchaseId: newPurchase._id,
        userId: req.user._id,
        date: newPurchase.createdAt.toLocaleString().split(",")[0],
        item: item.title + " (" + item.evaluatorLimit + " Evaluators, " + item.evaluationLimit + " Evaluations)",
        amount: newPurchase.amount,
        paymentMethod: "Stripe",
        to: {
            name: req.user.name,
            email: req.user.email,
        },
        from: {
            name: merchantName,
            email: merchantAddress,
        }
    });

    return res.send(await newInvoice.save());
});

//COMPLETE PURCHASE (RAZORPAY)
router.post('/verify-razorpay-payment', validate, async (req, res) => {
    const { razorpay_order_id, transactionid, razorpay_signature, transactionamount } = req.body;
    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + transactionid)
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        const order = await Order.findOne({ orderId: razorpay_order_id });

        if (!order) return res.status(400).send('Invalid Order');

        const newPurchase = new Purchase({
            userId: req.user._id,
            itemId: order.itemId,
            transactionId: transactionid,
            amount: transactionamount,
            paymentMethod: "razorpay",
        });

        const item = await ShopItem.findById(order.itemId);

        await Limits.findOneAndUpdate({ userId: req.user._id }, { $inc: { evaluatorLimit: item.evaluatorLimit, evaluationLimit: item.evaluationLimit } });

        await newPurchase.save();
        await Order.findOneAndDelete({ orderId: razorpay_order_id });

        const newInvoice = new Invoice({
            purchaseId: newPurchase._id,
            userId: req.user._id,
            date: newPurchase.createdAt.toLocaleString().split(",")[0],
            item: item.title + " (" + item.evaluatorLimit + " Evaluators, " + item.evaluationLimit + " Evaluations)",
            amount: newPurchase.amount,
            paymentMethod: "Razorpay",
            to: {
                name: req.user.name,
                email: req.user.email,
            },
            from: {
                name: merchantName,
                email: merchantAddress,
            }
        });

        return res.send(await newInvoice.save());
    } else {
        return res.status(400).send('Payment verification failed');
    }
});

async function capturePayment(orderId) {
    const accessToken = await generateAccessToken();
    const url = `${base}/v2/checkout/orders/${orderId}/capture`;
    const response = await fetch(url, {
        method: "post",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
    });
    const data = await response.json();
    return data;
}

//COMPLETE PURCHASE (PAYPAL)
router.post('/verify-paypal-payment', validate, async (req, res) => {
    const { orderId } = req.body;

    const order = await Order.findOne({ orderId: orderId });

    if (!order) return res.status(400).send('Invalid Order');

    const capture = await capturePayment(orderId);

    if (capture.status === "COMPLETED") {

        const newPurchase = new Purchase({
            userId: req.user._id,
            itemId: order.itemId,
            transactionId: orderId,
            paymentMethod: "paypal",
            amount: order.amount,
        });

        const item = await ShopItem.findById(order.itemId);

        await Limits.findOneAndUpdate({ userId: req.user._id }, { $inc: { evaluatorLimit: item.evaluatorLimit, evaluationLimit: item.evaluationLimit } });

        await newPurchase.save();
        await Order.findOneAndDelete({ orderId: orderId });

        const newInvoice = new Invoice({
            purchaseId: newPurchase._id,
            userId: req.user._id,
            date: newPurchase.createdAt.toLocaleString().split(",")[0],
            item: item.title + " (" + item.evaluatorLimit + " Evaluators, " + item.evaluationLimit + " Evaluations)",
            amount: newPurchase.amount,
            paymentMethod: "PayPal",
            to: {
                name: req.user.name,
                email: req.user.email,
            },
            from: {
                name: merchantName,
                email: merchantAddress,
            }
        });
        
        return res.send(await newInvoice.save());
    }
    else {
        return res.status(400).send('Payment verification failed');
    }
});

export default router;