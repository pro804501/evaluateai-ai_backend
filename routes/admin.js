import joi from "joi";
import express from "express";
import ShopItem from "../models/ShopItem.js";
import User from "../models/User.js";
import Purchase from "../models/Purchase.js";
import PaymentMethod from "../models/PaymentMethod.js";
import { validateAdmin } from "../middlewares/validate.js";
import Limits from "../models/Limits.js";
import Faq from "../models/Faq.js";

const router = express.Router();

router.get("/", validateAdmin, async (req, res) => {
    return res.send("Admin Panel");
});

//DASHBOARD START
router.get("/dashboard", validateAdmin, async (req, res) => {
    const users = await User.find().countDocuments();
    const items = await ShopItem.find().countDocuments();
    const purchasesData = await Purchase.find();
    const purchases = purchasesData.length;
    var earnings = 0;
    for (const purchase of purchasesData) {
        earnings += purchase.amount;
    }

    return res.send({ users, items, purchases, earnings });
});
//DASHBOARD END

//SHOP START
router.get("/shop", validateAdmin, async (req, res) => {
    return res.send((await ShopItem.find()).reverse());
});

router.post("/shop/create", validateAdmin, async (req, res) => {
    const schema = joi.object({
        title: joi.string().required(),
        evaluatorLimit: joi.number().required(),
        evaluationLimit: joi.number().required(),
        price: joi.number().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const newItem = await ShopItem({
            enable: true,
            title: data.title,
            evaluatorLimit: data.evaluatorLimit,
            evaluationLimit: data.evaluationLimit,
            price: data.price,
        });

        await newItem.save();

        return res.send(newItem);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/shop/edit", validateAdmin, async (req, res) => {
    const schema = joi.object({
        itemId: joi.string().required(),
        enable: joi.boolean().required(),
        title: joi.string().required(),
        evaluatorLimit: joi.number().required().min(0),
        evaluationLimit: joi.number().required().min(0),
        price: joi.number().required().min(0),
    });

    try {
        const data = await schema.validateAsync(req.body);
        await ShopItem.findOneAndUpdate({ _id: data.itemId }, {
            enable: data.enable,
            title: data.title,
            evaluatorLimit: data.evaluatorLimit,
            evaluationLimit: data.evaluationLimit,
            price: data.price,
        });

        return res.send("Updated!");
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/shop/delete", validateAdmin, async (req, res) => {
    const schema = joi.object({
        itemId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);
        await ShopItem.findByIdAndDelete(data.itemId);

        return res.send("Deleted!");
    }
    catch (err) {
        return res.status(500).send(err);
    }
});
//SHOP END

//PAYMENT METHODS START
router.get("/payment-methods", validateAdmin, async (req, res) => {
    const paymentMethod = await PaymentMethod.findOne();

    if (!paymentMethod) {
        return res.send({ razorpay: true, stripe: true, paypal: true });
    }

    return res.send({
        razorpay: paymentMethod.razorpay,
        stripe: paymentMethod.stripe,
        paypal: paymentMethod.paypal,
    });
});

router.post("/payment-methods", validateAdmin, async (req, res) => {
    const schema = joi.object({
        razorpay: joi.boolean().required(),
        stripe: joi.boolean().required(),
        paypal: joi.boolean().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);
        const paymentMethod = await PaymentMethod.findOne();

        if (!paymentMethod) {
            const newPaymentMethod = new PaymentMethod({
                razorpay: data.razorpay,
                stripe: data.stripe,
                paypal: data.paypal,
            });

            await newPaymentMethod.save();
            return res.send({
                razorpay: newPaymentMethod.razorpay,
                stripe: newPaymentMethod.stripe,
                paypal: newPaymentMethod.paypal,
            });
        }

        paymentMethod.razorpay = data.razorpay;
        paymentMethod.stripe = data.stripe;
        paymentMethod.paypal = data.paypal;

        await paymentMethod.save();

        return res.send({
            razorpay: paymentMethod.razorpay,
            stripe: paymentMethod.stripe,
            paypal: paymentMethod.paypal,
        });
    }
    catch (err) {
        return res.status(500).send(err)
    }
});
//PAYMENT METHODS END

//USERS START
router.get("/users", validateAdmin, async (req, res) => {
    const users = (await User.find().select("-password")).reverse();

    var usersData = [];
    for (const user of users) {
        const limits = await Limits.findOne({ userId: user._id });
        const purchases = await Purchase.find({ userId: user._id });

        usersData.push({
            _id: user._id,
            name: user.name,
            email: user.email,
            type: user.type,
            limits: limits ?? { evaluationLimit: 0, evaluatorLimit: 0 },
            purchases: purchases.length,
        });
    }

    return res.send(usersData);
});
//USERS END

//SETTINGS START
router.get("/settings", validateAdmin, async (req, res) => {
    return res.send("Users");
});
//SETTINGS END

//PURCHASES START
router.get("/purchases", validateAdmin, async (req, res) => {
    const purchases = (await Purchase.find()).reverse();

    var purchasesData = [];

    for (const purchase of purchases) {
        const user = await User.findById(purchase.userId);
        const item = await ShopItem.findById(purchase.itemId);

        purchasesData.push({
            _id: purchase._id,
            user: user.name,
            email: user.email,
            item: item.title,
            amount: purchase.amount,
            paymentMethod: purchase.paymentMethod,
            date: purchase.createdAt.toLocaleString().split(",")[0]
        });
    }

    return res.send(purchasesData);
});
//PURCHASES END

//FAQ START
router.get("/faq", validateAdmin, async (req, res) => {
    return res.send(await Faq.find());
});

router.post("/faq/create", validateAdmin, async (req, res) => {
    const schema = joi.object({
        question: joi.string().required(),
        answer: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);
        const newFaq = new Faq({
            question: data.question,
            answer: data.answer,
        });

        await newFaq.save();
        return res.send(newFaq);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/faq/delete", validateAdmin, async (req, res) => {
    const schema = joi.object({
        faqId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);
        await Faq.findByIdAndDelete(data.faqId);
        return res.send("Deleted!");
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

export default router;
