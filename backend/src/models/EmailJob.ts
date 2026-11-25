import mongoose, { Document, Schema } from "mongoose";

export interface IEmailJob extends Document {
  to: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  status: "SCHEDULED" | "SENT" | "FAILED";
  sentAt?: Date;
  previewUrl?: string;
  error?: string;
  jobId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const emailJobSchema = new Schema<IEmailJob>(
  {
    to: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["SCHEDULED", "SENT", "FAILED"],
      default: "SCHEDULED",
    },
    sentAt: { type: Date },
    previewUrl: { type: String },
    error: { type: String },
    jobId: { type: String },
  },
  { timestamps: true }
);

emailJobSchema.index({ status: 1, scheduledAt: -1 });
emailJobSchema.index({ scheduledAt: -1 });

export default mongoose.model<IEmailJob>("EmailJob", emailJobSchema);
