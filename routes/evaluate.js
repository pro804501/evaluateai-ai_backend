import joi from "joi";
import express from "express";
import { validate } from "../middlewares/validate.js";
import Evaluator from "../models/Evaluator.js";
import Limits from "../models/Limits.js";
import Evaluation from "../models/Evaluation.js";
import Class from "../models/Class.js";
import OpenAI from "openai";
import dotenv from "dotenv";
import { aiPrompt } from "../utils/utils.js";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const router = express.Router();

//EVALUATORS
router.get("/evaluators", validate, async (req, res) => {
    const evaluators = await Evaluator.find({ userId: req.user._id }).lean();

    for (const evaluator of evaluators) {
        evaluator.class = await Class.findById(evaluator.classId).select("name section subject");
    }

    return res.send({ evaluators: evaluators.reverse(), user: { name: req.user.name, email: req.user.email, type: req.user.type }, limits: await Limits.findOne({ userId: req.user._id }).select("evaluatorLimit evaluationLimit") });
});

router.post("/evaluators/create", validate, async (req, res) => {
    const schema = joi.object({
        classId: joi.string().required(),
        title: joi.string().required(),
        questionPapers: joi.array().required(),
        answerKeys: joi.array().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const limits = await Limits.findOne({ userId: req.user._id });

        if (limits.evaluatorLimit <= 0) {
            return res.status(400).send("Evaluator limit exceeded");
        }

        const classData = await Class.findById(data.classId);
        if (!classData) {
            return res.status(400).send("Class not found");
        }

        limits.evaluatorLimit -= 1;

        await limits.save();

        const evaluator = new Evaluator({
            userId: req.user._id,
            classId: data.classId,
            title: data.title,
            questionPapers: data.questionPapers,
            answerKeys: data.answerKeys,
        });

        await evaluator.save();

        return res.send(evaluator);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluators/delete", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const limits = await Limits.findOne({ userId: req.user._id });

        limits.evaluatorLimit += 1;

        await limits.save();

        await Evaluator.findByIdAndDelete(data.evaluatorId);

        await Evaluation.deleteOne({ evaluatorId: data.evaluatorId });

        return res.send("Evaluator deleted");
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluators/update", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
        title: joi.string().required(),
        classId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        evaluator.title = data.title;
        evaluator.classId = data.classId;

        await evaluator.save();

        return res.send(evaluator);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluators/evaluate", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
        rollNo: joi.number().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        const limit = await Limits.findOne({ userId: req.user._id });

        if (limit.evaluationLimit <= 0) {
            return res.status(400).send("Evaluation limit exceeded");
        }

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const evaluation = await Evaluation.findOne({ evaluatorId: data.evaluatorId });

        if (!evaluation) {
            return res.status(400).send("Evaluation not found");
        }

        const answerSheets = evaluation.answerSheets[data.rollNo - 1];

        if (!answerSheets) {
            return res.send(null);
        }

        const classData = await Class.findById(evaluator.classId);

        for (const answerSheet of evaluation.answerSheets) {
            if (answerSheet == null) {
                await Evaluation.updateOne({ evaluatorId: data.evaluatorId }, { $set: { ["data." + (evaluation.answerSheets.indexOf(answerSheet) + 1)]: null } });
            }
        }

        var questionPapersPrompt = [];
        var answerKeysPrompt = [];
        var answerSheetsPrompt = [];

        questionPapersPrompt.push({ type: "text", text: "Question Paper(s):" });
        for (const questionPaper of evaluator.questionPapers) {
            questionPapersPrompt.push({ type: "image_url", image_url: questionPaper });
        }

        answerKeysPrompt.push({ type: "text", text: "Answer Key(s):" });
        for (const answerKey of evaluator.answerKeys) {
            answerKeysPrompt.push({ type: "image_url", image_url: answerKey });
        }

        answerSheetsPrompt.push({ type: "text", text: "Answer Sheet(s):" });
        for (const answerSheet of answerSheets) {
            answerSheetsPrompt.push({ type: "image_url", image_url: answerSheet });
        }

        var messages = [
            {
                role: "system",
                content: aiPrompt,
            },
            {
                role: "user",
                content: questionPapersPrompt,
            },
            {
                role: "user",
                content: answerKeysPrompt,
            },
            {
                role: "user",
                content: "student_name: " + classData.students[data.rollNo - 1].name,
            },
            {
                role: "user",
                content: "roll_no: " + classData.students[data.rollNo - 1].rollNo,
            },
            {
                role: "user",
                content: "class: " + classData.name + " " + classData.section,
            },
            {
                role: "user",
                content: "subject: " + classData.subject,
            },
            {
                role: "user",
                content: answerSheetsPrompt,
            },
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            messages: messages,
            max_tokens: 1000,
        });

        const resp = completion.choices[0].message.content;

        const respData = JSON.parse(resp);

        await Evaluation.updateOne({ evaluatorId: data.evaluatorId }, { $set: { ["data." + (data.rollNo)]: respData } });

        await Limits.updateOne({ userId: req.user._id }, { $inc: { evaluationLimit: -1 } });

        return res.send(respData);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluators/revaluate", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
        rollNo: joi.number().required(),
        prompt: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        const limit = await Limits.findOne({ userId: req.user._id });

        if (limit.evaluationLimit <= 0) {
            return res.status(400).send("Evaluation limit exceeded");
        }

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const evaluation = await Evaluation.findOne({ evaluatorId: data.evaluatorId });

        if (!evaluation) {
            return res.status(400).send("Evaluation not found");
        }

        const answerSheets = evaluation.answerSheets[data.rollNo - 1];

        if (!answerSheets) {
            return res.send(null);
        }

        const classData = await Class.findById(evaluator.classId);

        for (const answerSheet of evaluation.answerSheets) {
            if (answerSheet == null) {
                await Evaluation.updateOne({ evaluatorId: data.evaluatorId }, { $set: { ["data." + (evaluation.answerSheets.indexOf(answerSheet) + 1)]: null } });
            }
        }

        var questionPapersPrompt = [];
        var answerKeysPrompt = [];
        var answerSheetsPrompt = [];

        questionPapersPrompt.push({ type: "text", text: "Question Paper(s):" });
        for (const questionPaper of evaluator.questionPapers) {
            questionPapersPrompt.push({ type: "image_url", image_url: questionPaper });
        }

        answerKeysPrompt.push({ type: "text", text: "Answer Key(s):" });
        for (const answerKey of evaluator.answerKeys) {
            answerKeysPrompt.push({ type: "image_url", image_url: answerKey });
        }

        answerSheetsPrompt.push({ type: "text", text: "Answer Sheet(s):" });
        for (const answerSheet of answerSheets) {
            answerSheetsPrompt.push({ type: "image_url", image_url: answerSheet });
        }

        var messages = [
            {
                role: "system",
                content: data.prompt && data.prompt !== "null" ? (aiPrompt + "\n\nTHIS IS REVALUATION. PROMPT: " + data.prompt + "\nGive remarks as 'Revaluated' for all questions extra remarks applied to.") : aiPrompt,
            },
            {
                role: "user",
                content: questionPapersPrompt,
            },
            {
                role: "user",
                content: answerKeysPrompt,
            },
            {
                role: "user",
                content: "student_name: " + classData.students[data.rollNo - 1].name,
            },
            {
                role: "user",
                content: "roll_no: " + classData.students[data.rollNo - 1].rollNo,
            },
            {
                role: "user",
                content: "class: " + classData.name + " " + classData.section,
            },
            {
                role: "user",
                content: "subject: " + classData.subject,
            },
            {
                role: "user",
                content: answerSheetsPrompt,
            },
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            messages: messages,
            max_tokens: 1000,
        });

        const resp = completion.choices[0].message.content;

        const respData = JSON.parse(resp);

        await Evaluation.updateOne({ evaluatorId: data.evaluatorId }, { $set: { ["data." + (data.rollNo)]: respData } });

        await Limits.updateOne({ userId: req.user._id }, { $inc: { evaluationLimit: -1 } });

        return res.send(respData);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

//EVALUATIONS
router.post("/evaluations/get", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const evaluation = await Evaluation.findOne({ evaluatorId: data.evaluatorId });

        if (!evaluation) {
            return res.send(null);
        }

        for (const answerSheet of evaluation.answerSheets) {
            if (answerSheet == null) {
                await Evaluation.updateOne({ evaluatorId: data.evaluatorId }, { $set: { ["data." + (evaluation.answerSheets.indexOf(answerSheet) + 1)]: null } });
            }
        }

        return res.send(evaluation);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluations/update", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
        answerSheets: joi.array(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const evaluation = await Evaluation.findOne({ evaluatorId: data.evaluatorId });

        var answerSheetsData = [];

        for (var answerSheet of data.answerSheets) {
            if (answerSheet == null) {
                answerSheetsData.push(null);
            }
            else if (answerSheet.length <= 0) {
                answerSheetsData.push(null);
            }
            else {
                answerSheetsData.push(answerSheet);
            }
        }

        if (!evaluation) {
            const newEvaluation = new Evaluation({
                evaluatorId: data.evaluatorId,
                data: data.data,
                answerSheets: answerSheetsData,
            });

            await newEvaluation.save();

            return res.send(newEvaluation);
        }

        evaluation.answerSheets = answerSheetsData;
        await evaluation.save();

        return res.send(evaluation);
    }
    catch (err) {
        return res.send(err);
    }
});

router.post("/evaluations/results", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
        rollNo: joi.number().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const evaluation = await Evaluation.findOne({ evaluatorId: data.evaluatorId });

        if (!evaluation) {
            return res.send(null);
        }

        var resultsData = {};
        const students = (await Class.findById(evaluator.classId)).students;
        var studentData = {};

        for (const student of students) {
            if (data.rollNo === -1) {
                studentData = student;
                break;
            }

            if (student.rollNo === data.rollNo) {
                studentData = student;
            }
        }

        if (!evaluation.data[studentData.rollNo]) {
            return res.send({});
        }

        var totalScore = 0;
        var scored = 0;

        for (const answer of evaluation.data[studentData.rollNo].answers) {
            scored += answer.score[0];
            totalScore += answer.score[1];
        }

        resultsData["student_name"] = studentData.name;
        resultsData["roll_no"] = studentData.rollNo;
        resultsData["class"] = (await Class.findById(evaluator.classId)).name + " " + (await Class.findById(evaluator.classId)).section;
        resultsData["subject"] = (await Class.findById(evaluator.classId)).subject;
        resultsData["question_papers"] = evaluator.questionPapers;
        resultsData["answer_keys"] = evaluator.answerKeys;
        resultsData["answer_sheets"] = evaluation.answerSheets[studentData.rollNo - 1];
        resultsData["results"] = evaluation.data[studentData.rollNo].answers;
        resultsData["score"] = [scored, totalScore];

        return res.send(resultsData);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluations/results/all", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const evaluation = await Evaluation.findOne({ evaluatorId: data.evaluatorId });

        if (!evaluation) {
            return res.send(null);
        }

        var resultsData = [];

        const classData = await Class.findById(evaluator.classId);
        const students = classData.students;

        for (const student of students) {
            var studentData = {};

            if (!evaluation.data[student.rollNo]) {
                continue;
            }

            studentData["student_name"] = student.name;
            studentData["roll_no"] = student.rollNo;
            var scored = 0;
            var totalScore = 0;

            for (const answer of evaluation.data[student.rollNo].answers) {
                scored += answer.score[0];
                totalScore += answer.score[1];
            }

            studentData["score"] = scored + " / " + totalScore;

            resultsData.push(studentData);
        }

        return res.send({ class: { name: classData.name, section: classData.section, subject: classData.subject }, exam: evaluator.title, results: resultsData });
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluations/results/save", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
        rollNo: joi.number().required(),
        results: joi.array().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        const evaluator = await Evaluator.findById(data.evaluatorId);

        if (!evaluator) {
            return res.status(400).send("Evaluator not found");
        }

        if (evaluator.userId.toString() != req.user._id.toString()) {
            return res.status(400).send("Unauthorized");
        }

        const evaluation = await Evaluation.findOne({ evaluatorId: data.evaluatorId });

        if (!evaluation) {
            return res.send(null);
        }

        //update the results
        await Evaluation.updateOne({ evaluatorId: data.evaluatorId }, { $set: { ["data." + data.rollNo + ".answers"]: data.results } });

        return res.send(evaluation);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

router.post("/evaluations/delete", validate, async (req, res) => {
    const schema = joi.object({
        evaluatorId: joi.string().required(),
    });

    try {
        const data = await schema.validateAsync(req.body);

        await Evaluation.deleteOne({ evaluatorId: data.evaluatorId });

        return res.send("Evaluation deleted");
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

export default router;