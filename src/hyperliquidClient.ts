import * as ENV from './env';
import { GetPriceParams, GetPricePayload } from './types/hyperliquid-api/HyperliquidClient';

export class HyperliquidClient {
  hyperliquid_api_url = ENV.HYPERLIQUID_API_URL
  milliseconds_in_1_minute = 60_000
  milliseconds_in_1_hour = this.milliseconds_in_1_minute * 60
  milliseconds_in_1_day = this.milliseconds_in_1_hour * 24

  constructor() {}

  async getOLHC({ coin, endTime, startTime, interval }: GetPriceParams) {
    if (!endTime) { endTime = Date.now() }
    if (!startTime) { startTime = endTime - this.milliseconds_in_1_day }
    const resp = await fetch(
      this.hyperliquid_api_url + "/info",
      {
        method: "POST",
        headers: {
          "Content-Type": 'application/json',
        },
        body: JSON.stringify({
          req: {
            coin: coin,
            endTime: endTime,
            interval: interval,
            startTime: startTime
          },
          type: "candleSnapshot"
        })
      }
    )
    return await resp.json() as GetPricePayload[]
  }
}
