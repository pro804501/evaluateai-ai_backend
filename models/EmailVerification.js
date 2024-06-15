import mongoose from "mongoose";

const emailVerificationSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
        },
        code: {
            type: String,
            required: true,
        },
        isVerified: {
            type: Boolean,
            required: true,
        },
    },
    { timestamps: true }
);

const EmailVerification = mongoose.model("EmailVerification", emailVerificationSchema);

export default EmailVerification;