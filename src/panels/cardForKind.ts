/**
 * cardForKind — maps a kind string to the correct card component.
 *
 * Returns a React component constructor that implements CardProps.
 * Unknown kinds fall through to GenericCard — no hard failure.
 *
 * Phase 3 — record-panels agent.
 */

import type { CardProps } from '@/panels/types';
import type { ComponentType } from 'react';

import { PolityCard }       from '@/panels/PolityCard';
import { EventCard }        from '@/panels/EventCard';
import { JourneyCard }      from '@/panels/JourneyCard';
import { RelationshipCard } from '@/panels/RelationshipCard';
import { RulerCard }        from '@/panels/RulerCard';
import { SourceCard }       from '@/panels/SourceCard';
import { GenericCard }      from '@/panels/GenericCard';
// Wave 3 / Phase C + Wave 5 / Phase F — Group C: Inspector Cards
import { CapitalCard }      from '@/panels/CapitalCard';
import { SettlementCard }   from '@/panels/SettlementCard';
import { MilitaryCard }     from '@/panels/MilitaryCard';
// Wave 6 / research-first layer
import { ClaimCard }            from '@/panels/ClaimCard';
import { AnnotationCard }       from '@/panels/AnnotationCard';
import { ResearchQuestionCard } from '@/panels/ResearchQuestionCard';

/** Lookup table: kind string → card component. */
const KIND_MAP: Readonly<Record<string, ComponentType<CardProps>>> = {
  polity:       PolityCard,
  event:        EventCard,
  journey:      JourneyCard,
  relationship: RelationshipCard,
  ruler:        RulerCard,
  source:       SourceCard,
  institution:  GenericCard,
  technology:   GenericCard,
  text:         GenericCard,
  // Wave 3 / Phase C geo-escalated kinds
  capital:      CapitalCard,
  settlement:   SettlementCard,
  military:     MilitaryCard,
  // Wave 6 / research-first layer
  claim:             ClaimCard,
  annotation:        AnnotationCard,
  research_question: ResearchQuestionCard,
};

/**
 * Return the card component for a given kind string.
 *
 * Falls back to GenericCard for any unknown kind so future dataset extensions
 * never hard-crash the dock.
 *
 * @param kind - The record kind string from RawRecord.kind or selectionStore.selectedType.
 * @returns A React component implementing CardProps.
 */
export function cardForKind(kind: string): ComponentType<CardProps> {
  return KIND_MAP[kind] ?? GenericCard;
}
