import { Player } from '../models/Player.js';
import { Score } from '../models/Score.js';

export class BadgeManager {
  /**
   * Resolves the weekly leaderboard and awards nested/one-time badges.
   */
  public static async resolveWeeklyRanksAndAwardBadges(weekId: number): Promise<void> {
    // 1. Retrieve the top 10 players based on weekly leaderboard sorting logic
    const topPlayers = await Score.aggregate([
      { $match: { weekId, isValid: true } },
      {
        $group: {
          _id: '$playerAddress',
          weeklyScore: { $sum: '$score' },
          gamesCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'players',
          localField: '_id',
          foreignField: 'address',
          as: 'playerInfo'
        }
      },
      { $unwind: '$playerInfo' },
      {
        $project: {
          playerAddress: '$_id',
          weeklyScore: 1,
          gamesCount: 1,
          referralPoints: '$playerInfo.referralPoints'
        }
      },
      {
        $sort: {
          weeklyScore: -1,
          gamesCount: 1,
          referralPoints: -1
        }
      },
      { $limit: 10 }
    ]);

    // 2. Distribute appropriate badges
    for (let i = 0; i < topPlayers.length; i++) {
      const player = topPlayers[i];
      const rank = i + 1;
      const address = player.playerAddress;
      const playerDoc = await Player.findOne({ address });
      if (!playerDoc) continue;

      const badgesToAward: Array<'FIRST_PLACE' | 'SECOND_PLACE' | 'THIRD_PLACE' | 'TOP_5' | 'TOP_10'> = [];

      // Repeatable place badges
      if (rank === 1) badgesToAward.push('FIRST_PLACE');
      else if (rank === 2) badgesToAward.push('SECOND_PLACE');
      else if (rank === 3) badgesToAward.push('THIRD_PLACE');

      // One-time tier achievements
      if (rank <= 5) badgesToAward.push('TOP_5');
      if (rank <= 10) badgesToAward.push('TOP_10');

      let hasUpdated = false;
      for (const bType of badgesToAward) {
        const isOneTime = bType === 'TOP_5' || bType === 'TOP_10';
        const alreadyHas = isOneTime
          ? playerDoc.badges.some(b => b.badgeType === bType)
          : playerDoc.badges.some(b => b.badgeType === bType && b.weekId === weekId);

        if (!alreadyHas) {
          playerDoc.badges.push({
            badgeType: bType,
            earnedAt: new Date(),
            weekId
          });
          hasUpdated = true;
        }
      }

      if (hasUpdated) {
        await playerDoc.save();
      }
    }
  }
}
