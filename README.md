# Address front running bot

## Setup:

1. Clone the git repo in you local PC or VM by this command: <br> `git clone https://github.com/SajawalFareedi/wallet-front-running-bot.git`.
2. After clone open terminal in the folder.
3. Install all of the required packages using `yarn` or you can also use `npm install`.
4. Now, create a new `.env` file and copy the values from `.env-example`. Open the `.env` file in notepad or any other text-editor and update the following parameters:

```env
PRIVATE_KEY = Private key of the wallet you want to use for sending tx.
ADDRESS = The address of the above wallet (for which you are giving the private key).
ALCHEMY_API = Get a free alchemy API from here: https://www.alchemy.com/
ETHERSCAN_API = Etherscan API Key
BLOCKNATIVE_API = Blocknative API Key
ADDRESS_FROM = This is the address you want to follow.
ADDRESS_TOS = Put multiple addresses here (separated by comma (,)). These are the  "to" addresses. If any of the address from these given addresses matched with the "to" of the tx then that tx will be front-run else not.
NETWORK = The value of network can be either mainnet or goerli.
```

5. Now the bot is set up! You can run it using `yarn start` or `npm start`.
