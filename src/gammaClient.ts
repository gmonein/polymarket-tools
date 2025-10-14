import type { ListMarketsParams } from './types/gamma-api/ListMarketsParams'
import { ListMarketsResponse } from './types/gamma-api/ListMarketsResponse';
import * as ENV from './env';

export class GammaClient {
  gamme_api_url = ENV.GAMMA_API_URL

  constructor() {}

  // https://docs.polymarket.com/api-reference/markets/list-markets
  async listMarkets(params: ListMarketsParams): Promise<ListMarketsResponse> {
    const url = this.gamme_api_url + '/markets?' + new URLSearchParams(this.stringifyValues(params)).toString()
    console.log(url)
    const resp = await fetch(url)
    return await resp.json() as ListMarketsResponse
  }

  stringifyValues<T extends Record<string, any>>(obj: T): { [K in keyof T]: string } {
    const result: Partial<{ [K in keyof T]: string }> = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = String(obj[key]);
      }
    }
    return result as { [K in keyof T]: string };
  }
}
