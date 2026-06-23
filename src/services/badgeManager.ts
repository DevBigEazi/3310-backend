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

    // 3. Resolve and award/transfer the unique GOAT badge
    await this.resolveGoatBadge(weekId);
  }

  /**
   * Resolves the unique, transferable GOAT badge based on FIRST_PLACE wins.
   */
  public static async resolveGoatBadge(weekId: number): Promise<void> {
    const currentGoatPlayer = await Player.findOne({ 'badges.badgeType': 'GOAT' });
    const currentGoatAddress = currentGoatPlayer?.address || null;

    const playersWithFirstPlace = await Player.find({ 'badges.badgeType': 'FIRST_PLACE' });

    let goatPlayerAddress: string | null = null;
    let maxFirstPlaceCount = 0;
    const tiedAddresses: string[] = [];

    for (const player of playersWithFirstPlace) {
      const firstPlaceCount = player.badges.filter(b => b.badgeType === 'FIRST_PLACE').length;
      if (firstPlaceCount > maxFirstPlaceCount) {
        maxFirstPlaceCount = firstPlaceCount;
        goatPlayerAddress = player.address;
        tiedAddresses.length = 0;
        tiedAddresses.push(player.address);
      } else if (firstPlaceCount === maxFirstPlaceCount && maxFirstPlaceCount > 0) {
        tiedAddresses.push(player.address);
      }
    }

    if (tiedAddresses.length > 1) {
      if (currentGoatAddress && tiedAddresses.includes(currentGoatAddress)) {
        goatPlayerAddress = currentGoatAddress;
      } else {
        let highestHighScore = -1;
        let tieBreakerAddress = tiedAddresses[0];

        for (const addr of tiedAddresses) {
          const stats = await Score.aggregate([
            { $match: { playerAddress: addr, isValid: true } },
            { $group: { _id: '$playerAddress', highestScore: { $max: '$score' } } }
          ]);
          const hs = stats[0]?.highestScore || 0;
          if (hs > highestHighScore) {
            highestHighScore = hs;
            tieBreakerAddress = addr;
          }
        }
        goatPlayerAddress = tieBreakerAddress;
      }
    }

    if (goatPlayerAddress) {
      if (goatPlayerAddress !== currentGoatAddress) {
        if (currentGoatAddress) {
          await Player.updateOne(
            { address: currentGoatAddress },
            { $pull: { badges: { badgeType: 'GOAT' } } }
          );
        }

        await Player.updateOne(
          { address: goatPlayerAddress },
          {
            $push: {
              badges: {
                badgeType: 'GOAT',
                earnedAt: new Date(),
                weekId
              }
            }
          }
        );
      } else {
        await Player.updateOne(
          { address: goatPlayerAddress, 'badges.badgeType': 'GOAT' },
          { $set: { 'badges.$.weekId': weekId, 'badges.$.earnedAt': new Date() } }
        );
      }
    }
  }
}
