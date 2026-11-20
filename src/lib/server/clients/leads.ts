/** A normalized lead from any collector, before it is stored as an editorial candidate. */
export interface CandidateLead {
  id: string;
  title: string;
  url: string;
  impact: string;
  status: string;
  occurred: string;
  updated: string;
  category: 'outage' | 'vulnerability';
}
