import * as ENV from "./env";
import { Chain, ClobClient } from "@polymarket/clob-client";
import { GetMarketsPayload } from './types/clob-api/GetMarketsPayload'
import { GammaClient } from "./gammaClient";

async function globRequest() {
  const host = ENV.CLOB_API_URL;
  const chainId = parseInt(`${ENV.CHAIN_ID}`) as Chain;
  const clobClient = new ClobClient(host, chainId);

  let markets: GetMarketsPayload['data'] = []
  let cursor = ''
  for(let i = 0; i < 100; i += 1) {
    const page: GetMarketsPayload = await clobClient.getMarkets(`next_cursor=${cursor}`)
    const filtered_markets = page.data.filter(bet => { bet.question.includes('price') || bet.question.includes('Price') })
    markets = [...markets, ...filtered_markets]
    cursor = page.next_cursor
  }
  console.log(markets.map(m => m.question))
}

async function gammaRequest() {
  const gammaClient = new GammaClient()
  for (let i = 0; i < 10; i += 1) {
    const markets = await gammaClient.listMarkets({
      limit: 50,
      offset: i * 50,
      order: 'createdAt',
      ascending: false,
    })
    console.log(markets.filter(e => e.description.includes('Bitcoin')).map(e => [e.question]))
  }
}

gammaRequest()
