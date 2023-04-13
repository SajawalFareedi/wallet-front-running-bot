require("dotenv").config({ path: "./.env" });
const { WebSocket } = require("ws");
const ethers = require("ethers");
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const BlocknativeSdk = require("bnc-sdk");
// const BncTypes = require("bnc-sdk/dist/types/src/types");
const axios = require("axios").default;
const { readFileSync } = require("fs");

const env = process.env;

/**
 * 
 * @returns {Promise<object>} The ABIs for given contracts
 */
const getABIsForContracts = async () => {
    try {
        const ETHERSCAN_API = env.ETHERSCAN_API
        const contracts = env.ADDRESS_TOS.split(",");
        const ABIs = {};

        for (let i = 0; i < contracts.length; i++) {
            const contract = contracts[i].toLowerCase();
            var abi = null

            try {
                var abi = JSON.parse(readFileSync(__dirname + `/ABI/${contract}.json`, { encoding: "utf8" }));
            } catch (e) {
                const apiEndpoint = `https://api.etherscan.io/api?module=contract&action=getabi&address=${contract}&apikey=${ETHERSCAN_API}`;
                const headers = {
                    "accept": "*/*",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
                }
                const data = (await axios.get(apiEndpoint, { headers: headers })).data;

                if (data.status == "1") {
                    var abi = JSON.parse(data.result);
                }
            }

            if (abi) {
                ABIs[contract] = abi;
            }
        }

        return ABIs;

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

/**
 * 
 * @param {ethers.providers.AlchemyProvider} provider The provider to use for getting gas price
 * @returns {Promise<string>} Highest gas price
 */
const getGasPrice = async (provider) => {
    try {
        const apiEndpoint = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${env.ETHERSCAN_API}`;
        const headers = {
            "accept": "*/*",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
        }
        const data = (await axios.get(apiEndpoint, { headers: headers })).data;

        if (data.status == "1") {
            return ethers.utils.parseUnits(data.result.FastGasPrice, "gwei").toString();
        }

    } catch (error) {
        console.error(error);
    }

    return (await provider.getGasPrice()).toString();
}

/**
 * 
 * @param {BncTypes.TransactionData | BncTypes.TransactionEventLog} tx The full tx received from mempool
 * @param {ethers.Wallet} wallet The address to use for sending tx
 * @param {ethers.providers.AlchemyProvider} provider The provider to use for getting gas price
 * @returns {Promise<object>} The tx containing required params
 */
const createTransaction = async (tx, wallet, provider) => {
    let final_tx = {};
    const additionalFeesToAdd = env.NETWORK == "goerli" ? 5000000000 : 2000000000;

    // const gasPrice = await getGasPrice(provider);
    const nonce = await provider.getTransactionCount(wallet.address);

    final_tx["from"] = wallet.address;
    final_tx["to"] = tx.to;
    final_tx["nonce"] = nonce;
    final_tx["gasLimit"] = tx.gas;
    final_tx["gasPrice"] = parseInt(tx.maxFeePerGas) + additionalFeesToAdd;
    final_tx["data"] = tx.input;
    tx.value !== "0" ? final_tx["value"] = ethers.BigNumber.from(tx.value) : null

    // final_tx["maxPriorityFeePerGas"] = parseInt(tx.maxPriorityFeePerGas) + 1000000000;
    // final_tx["maxFeePerGas"] = parseInt(tx.maxFeePerGas) + 5000000000;

    return final_tx;
}

/**
 * @param {object} ABIs The ABIs of the contracts which are in ADDRESS_TOS variable
 * @param {FlashbotsBundleProvider} flashbotsProvider The flashbots provider to use for sending txs
 * @param {ethers.Wallet} wallet The wallet to use for signing txs
 * @param {ethers.providers.AlchemyProvider} provider The provider to use for getting gas price
 */
const initBlockNativeAndWatchMempool = async (ABIs, flashbotsProvider, wallet, provider) => {
    const BLOCKNATIVE_API = env.BLOCKNATIVE_API;
    const ADDRESS_FROM = env.ADDRESS_FROM.toLowerCase().trim();
    const ADDRESS_TOS = env.ADDRESS_TOS.toLowerCase().split(',');
    // const abiCoder = new ethers.utils.AbiCoder();

    const blocknative = new BlocknativeSdk({
        dappId: BLOCKNATIVE_API,
        networkId: env.NETWORK == "goerli" ? 5 : 1,
        ws: WebSocket
    });

    const { emitter, details } = blocknative.account(ADDRESS_FROM);
    emitter.on('txPool', async (transaction) => {
        console.log("\n");
        console.log(
            `New pending tx found in mempool ::: https://${env.NETWORK == "goerli" ? "goerli.etherscan" : "etherscan"}.io/tx/${transaction.hash}/`
        );
        console.log("Checking if \"to\" matches with one of the addresses your provided...");

        for (let i = 0; i < ADDRESS_TOS.length; i++) {
            const address_to = ADDRESS_TOS[i].trim();
            if (transaction.to.toLowerCase() == address_to) {
                const tx = await createTransaction(transaction, wallet, provider);

                console.log("\"to\" matched for the below tx: ");
                console.log(tx);
                console.log("Trying to front-run it! Sending tx through flashbots...");
                
                if (env.NETWORK == "goerli") {
                    const signedTx = await wallet.signTransaction(tx);
                    var txRes = await provider.sendTransaction(signedTx);
                } else {
                    var txRes = await flashbotsProvider.sendPrivateTransaction({ transaction: tx, signer: wallet });
                }

                console.log("Tx Sent! Receipt -> ", txRes);
                break;
            }
        }
    })
}

/**
 * 
 * @returns {Promise<void>}
 */
const run = async () => {
    const ABIs = {}; // await getABIsForContracts();
    const flashbotsRelay = env.NETWORK == "goerli" ? "https://relay-goerli.flashbots.net" : "https://relay.flashbots.net";

    if (env.ALCHEMY_API) {
        if (env.NETWORK == "goerli") {
            var provider = new ethers.providers.AlchemyProvider({ name: "goerli", chainId: 5 }, env.ALCHEMY_API);
        } else {
            var provider = new ethers.providers.AlchemyProvider(null, env.ALCHEMY_API);
        }
    } else {
        console.error("Invalid alchemy_api was given! Update config and try again...");
        process.exit(1);
    }

    console.info("Connected with the provider!");

    const currentNetwork = await provider.getNetwork();
    console.log("Network Config:", currentNetwork);

    const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
    const flashbotsProvider = await FlashbotsBundleProvider.create(provider, wallet, flashbotsRelay, currentNetwork.name);

    console.log("Connected with the Wallet:", wallet.address);
    console.info("Monitoring Mempool...");

    await initBlockNativeAndWatchMempool(ABIs, flashbotsProvider, wallet, provider);
}

(async () => {
    console.log("Starting the bot...");
    await run()
})();
