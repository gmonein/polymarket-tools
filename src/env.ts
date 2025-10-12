import { configDotenv } from 'dotenv'
configDotenv({ quiet: true })

export const PRIVATE_KEY = process.env.PRIVATE_KEY
if (!PRIVATE_KEY) { throw new Error("Missing env: PRIVATE_KEY") }

export const WALLET = process.env.WALLET
if (!WALLET) { throw new Error("Missing env: WALLET") }

export const FUNDER = process.env.FUNDER
if (!FUNDER) { throw new Error("Missing env: FUNDER") }

export const CLOB_API_URL = process.env.CLOB_API_URL || 'https://clob.polymarket.com'
export const POLYGON_CHAIN_ID = 137
export const AMOY_CHAIN_ID = 80002
export const CHAIN_ID = process.env.MAINNET == "true" ? POLYGON_CHAIN_ID : AMOY_CHAIN_ID
export const GAMMA_API_URL = process.env.GAMMA_API_URL || 'https://gamma-api.polymarket.com'
