import mongoose, { Document, Schema } from 'mongoose';

export interface IPlayer extends Document {
  address: string;
  username?: string;
  email?: string;
  createdAt: Date;
  totalScoresSubmitted: number;
  lifetimeEarnings: number;
  referredBy?: string;
  referralCode: string;
  referralPoints: number;
}

const playerSchema = new Schema<IPlayer>({
  address: { type: String, required: true, unique: true, lowercase: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, unique: true, lowercase: true },
  createdAt: { type: Date, default: Date.now },
  totalScoresSubmitted: { type: Number, default: 0 },
  lifetimeEarnings: { type: Number, default: 0 },
  referredBy: { type: String, lowercase: true },
  referralCode: { type: String, unique: true },
  referralPoints: { type: Number, default: 0 }
});

export const Player = mongoose.model<IPlayer>('Player', playerSchema);
