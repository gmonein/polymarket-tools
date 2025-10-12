export type ListMarketsParams = {
  limit: number, // Required range: x >= 0
  offset: number, // Required range: x >= 0
  order?: string, // Comma-separated list of fields to order by
  ascending?: boolean,
  id?: number[],
  slug?: string[],
  clob_token_ids?: string[],
  condition_ids?: string[],
  market_maker_address?: string[],
  liquidity_num_min?: number,
  liquidity_num_max?: number,
  volume_num_min?: number,
  volume_num_max?: number,
  start_date_min?: string,
  start_date_max?: string,
  end_date_min?: string,
  end_date_max?: string,
  tag_id?: number,
  related_tags?: boolean,
  cyom?: boolean,
  uma_resolution_status?: string,
  game_id?: string,
  sports_market_types?: string[],
  rewards_min_size?: number,
  question_ids?: string[],
  include_tag?: boolean,
}
