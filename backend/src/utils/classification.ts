import { Classification, CriterionBlock } from '@prisma/client';

export interface ScoreInput {
  block: CriterionBlock;
  score: number;
  weight: number;
}

export interface ScoreCalculation {
  technicalScore: number;
  behavioralScore: number;
  finalScore: number;
  classification: Classification;
}

/**
 * Pesos aplicados na nota final — alinhados com SIETCH_METRICS_Metodologia.md.
 * NUNCA confiamos em valores vindos do cliente — todo cálculo acontece aqui no backend.
 */
const TECHNICAL_WEIGHT = 0.6;
const BEHAVIORAL_WEIGHT = 0.4;

export function calculateScores(scores: ScoreInput[]): ScoreCalculation {
  const tecnicos = scores.filter((s) => s.block === 'TECNICO');
  const comports = scores.filter((s) => s.block === 'COMPORTAMENTAL');

  const technicalScore = weightedAverage(tecnicos);
  const behavioralScore = weightedAverage(comports);
  const finalScore = technicalScore * TECHNICAL_WEIGHT + behavioralScore * BEHAVIORAL_WEIGHT;

  return {
    technicalScore: round(technicalScore),
    behavioralScore: round(behavioralScore),
    finalScore: round(finalScore),
    classification: classify(finalScore),
  };
}

function weightedAverage(scores: ScoreInput[]): number {
  if (scores.length === 0) return 0;
  const totalWeight = scores.reduce((acc, s) => acc + s.weight, 0);
  if (totalWeight === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.score * s.weight, 0);
  return sum / totalWeight;
}

export function classify(score: number): Classification {
  if (score >= 4.2) return 'OTIMO';
  if (score >= 3.2) return 'BOM';
  if (score >= 2.0) return 'REGULAR';
  return 'CRITICO';
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
