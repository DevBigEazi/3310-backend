import { Schema, model, Document } from 'mongoose';

export interface IBadge {
  badgeType: 'FIRST_PLACE' | 'SECOND_PLACE' | 'THIRD_PLACE' | 'TOP_5' | 'TOP_10';
  earnedAt: Date;
  weekId: number;
}

export interface IPlayer extends Document {
  address: string;             // Lowercased EIP-7702 delegated wallet address
  username: string;
  email?: string;
  createdAt: Date;
  referralCode: string;
  referredBy: string | null;
  referralPoints: number;
  referralCount: number;
  badges: IBadge[];
  // Phase 2 backward compatibility placeholders
  isSubscribed: boolean;
  subscriptionExpiresAt: Date | null;
  lifetimeEarnings: number;
}

const PlayerSchema = new Schema<IPlayer>({
  address: { type: String, required: true, unique: true, lowercase: true, index: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, lowercase: true },
  createdAt: { type: Date, default: Date.now },
  referralCode: { type: String, required: true, unique: true, index: true },
  referredBy: { type: String, default: null, lowercase: true },
  referralPoints: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0, min: 0 },
  badges: [{
    badgeType: { type: String, enum: ['FIRST_PLACE', 'SECOND_PLACE', 'THIRD_PLACE', 'TOP_5', 'TOP_10'], required: true },
    earnedAt: { type: Date, default: Date.now },
    weekId: { type: Number, required: true }
  }],
  isSubscribed: { type: Boolean, default: false },
  subscriptionExpiresAt: { type: Date, default: null },
  lifetimeEarnings: { type: Number, default: 0 }
});

export const Player = model<IPlayer>('Player', PlayerSchema);
