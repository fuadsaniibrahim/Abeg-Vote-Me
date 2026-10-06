// Naija Daily headline templates. {var} = variable, {a|b} = variation, {#pool} = named pool.
// All names and outlets are fictional.

export const NEWS_POOLS: Record<string, string[]> = {
  reaction: ['Social media dey hot', 'Twitter users react', 'Na so the matter be', 'Wonders shall never end', 'E don happen again'],
  outlet: ['Naija Daily Sun-Rise', 'Arewa Chronicle', 'Lagos Metro TV', 'Voice of the People Radio', 'ThePinch Online'],
};

export const NEWS_TEMPLATES: Record<string, string[]> = {
  character_created: [
    '{name} from {lga}, {state} {declares interest in politics|steps into the political arena|says "my time don reach"}',
    'New face alert: {name} joins the {state} political scene',
  ],
  party_joined: ['{name} {joins|pitches tent with|moves into} {party}', '{party} welcomes {name} with {fanfare|small chops|loud music}'],
  party_left: ['{name} {dumps|quits|walks out on} {party}', '{#reaction}: {name} leaves {party}'],
  donation: ['{name} donates {amount} to {recipient}', '{amount} donation from {name} to {recipient} {raises eyebrows|gets people talking}'],
  business_started: ['{name} opens new {sector} in {state}', 'Business don start: {name} launches {sector}'],
  petition_created: ['Petition: "{title}"', 'Citizens rally behind petition: "{title}"'],
  petition_milestone: ['"{title}" petition hits {count} signatures', '{count} citizens sign "{title}" petition'],
  protest_called: ['{name} calls for protest over {issue} in {state}', '{#reaction}: protest over {issue} planned in {state}'],
  rally: ['{name} storms {state} rally, crowd {cheers|sings|dances}'],
  economy_monthly: [
    'Inflation {rises|climbs|moves} to {inflation}% as {food prices bite|market prices bite|traders lament}',
    'Petrol now {fuel} per litre, {#reaction}',
    'Naira trades at {fx} to the dollar',
  ],
  seat_taken: ['{name} {takes over|assumes office} as {seat}', 'New {office} in town: {name} takes {seat}'],
  seat_resigned: ['{name} {resigns|steps down} as {seat}', '{#reaction}: {name} quits as {seat}'],
  seat_vacated_inactive: ['{seat} declared vacant as {name} {goes missing in action|disappears from duty}', 'Where is {name}? {seat} declared vacant'],
  succession: ['{name} sworn in as {office} after predecessor exits', 'New {office}: {name} steps up in {state}'],
  deputy_appointed: ['{name} {named|appointed} new {office}', '{office} slot filled: {name} {gets the nod|is appointed}'],
  by_election_scheduled: ['By-election declared for {seat}', 'Electoral commission fixes by-election for {seat}'],
  npc_replaced: ['{name} takes over as {office} as two-term predecessor bows out', 'End of an era in {state}: {name} is new {office}'],
  lg_project: ['{name} commissions new {borehole|health centre|market stalls|road|classroom block} in {lga}', '{lga} council chairman {name} flags off {road project|water project|school renovation}'],
  governor_security: ['{name} {launches|announces} security push in {state}', '{state} governor {name} {boosts|steps up} security funding'],
  insecurity_monthly: ['Security situation {worsens|deteriorates} in {state}, residents worried', 'Residents in {state} report {improved|better} security'],
};
