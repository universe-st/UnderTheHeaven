import { Card } from '../models/Card';
import { BattleState } from '../models/BattleTypes';
import { findAllPlays, findBeatingPlays } from './HandRecognizer';

export function decidePlay(battleState: BattleState): Card[] | null {
  const aiHand = battleState.enemy.hand;

  if (battleState.phase === 'play') {
    const allPlays = findAllPlays(aiHand);
    if (allPlays.length === 0) return null;
    allPlays.sort((a, b) => a.mainValue - b.mainValue || a.cards.length - b.cards.length);
    return allPlays[0].cards;
  }

  // Respond phase - try to beat last play
  if (!battleState.lastPlay) return null;

  const beating = findBeatingPlays(aiHand, battleState.lastPlay);
  if (beating.length === 0) return null;

  // Choose smallest beating play
  beating.sort((a, b) => a.mainValue - b.mainValue || a.cards.length - b.cards.length);
  return beating[0].cards;
}
