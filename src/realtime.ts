import { RealTimeDataClient } from "@polymarket/real-time-data-client"
import { Message, SubscriptionMessage } from "@polymarket/real-time-data-client";
import * as ENV from './env'

const getSlugs = () => {
  const slugs = []

  const date = new Date()
  const now = Math.floor(Date.now() / 1000)
  const quarterInSeconds = 60 * 15
  const currentQuarter = Math.floor(now / (quarterInSeconds)) * quarterInSeconds

  for (let i = 0; i <= 4; i++) {
    const d = new Date(date.getTime() + i * 60 * 60 * 1000);
    const formatted = d.toLocaleString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", hour: "numeric", hour12: true });
    const [month, day, _at, hour, ampm] = formatted.toLowerCase().split(' ');
    slugs.push(`bitcoin-up-or-down-${month}-${day}-${hour}${ampm}-et`)
  }

  for (let i = 0; i <= 4; i++) {
    slugs.push(`btc-updown-15m-${currentQuarter + quarterInSeconds * i}`)
  }

  return(slugs);
}

type MessagePayload = {
  eventSlug: string;
  price: string;
  size: number;
  outcomeIndex: number;
}

const onMessage = (_: RealTimeDataClient, message: Message): void => {
  const payload = message.payload as MessagePayload

  if (getSlugs().includes(payload.eventSlug))
    console.log(
        `${payload.eventSlug}, ${payload.outcomeIndex}, ${payload.price}, ${payload.size}`,
    );
};

const onConnect = (client: RealTimeDataClient): void => {
  const slugs = getSlugs()

  console.log(slugs)
  client.subscribe({
    subscriptions: [
      ...slugs.map((slug) => ({
        topic: "activity",
        type: "*",
        // filters: `{"market_slug": "${slug}"}`
      })),
      //   {
      //   topic: "crypto_prices",
      //   type: "*",
      //   filters: `{"symbol":"btcusdt"}`,
      // },
      // {
      //   topic: "crypto_prices_chainlink",
      //   type: "*",
      //   filters: `{"symbol":"eth/usd"}`,
      // },
    ],
  });
};

new RealTimeDataClient({ onConnect, onMessage }).connect();
