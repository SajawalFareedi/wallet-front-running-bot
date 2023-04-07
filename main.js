const ethers = require("ethers");
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const axios = require("axios").default;
const { readFileSync } = require("fs");


/**
 * 
 * @returns {object} Config data read from config.txt
 */
const loadConfigFile = () => {
    let config = {};

    try {
        const file = readFileSync(__dirname + "/config.txt", { encoding: "utf8" }).split("\r").join("").trim().split("\n")

        for (let i = 0; i < file.length; i++) {
            const item = file[i].trim().split(" ");

            if (item[0] == "private_key") {
                config["private_key"] = item[1]
            } else if (item[0] == "address") {
                config["address"] = item[1].toLowerCase()
            } else if (item[0] == "etherscan_api") {
                config["etherscan_api"] = item[1]
            } else if (item[0] == "address_from") {
                config["address_from"] = item[1].toLowerCase()
            } else if (item[0] == "address_tos") {
                config["address_tos"] = item[1].split(",")
            } else if (item[0] == "alchemy_api") {
                config["alchemy_api"] = item[1].trim()
            }
        }

        return config;

    } catch (error) {
        console.error(error)
        process.exit(1)
    }
}

/**
 * 
 * @param {Array<string>} contracts The contracts for which you need ABIs
 * @param {string} etherscan_api Etherscan API for fetching ABI from etherscan if it's not already downloaded
 * @returns {Promise<object>} The ABIs for given contracts
 */
const getABIsForContracts = async (contracts, etherscan_api) => {
    try {
        const ABIs = {};

        for (let i = 0; i < contracts.length; i++) {
            const contract = contracts[i].toLowerCase();
            var abi = null

            try {
                var abi = JSON.parse(readFileSync(__dirname + `/ABI/${contract}.json`, { encoding: "utf8" }));
            } catch (e) {
                const apiEndpoint = `https://api.etherscan.io/api?module=contract&action=getabi&address=${contract}&apikey=${etherscan_api}`;
                const headers = {
                    "accept": "*/*",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
                }
                const data = (await axios.get(apiEndpoint, { headers: headers })).data;

                if (data.status == "1") {
                    var abi = JSON.parse(data.result)
                }
            }

            if (abi) {
                ABIs[contract] = abi
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
 * @param {string} address_from The address you want to follow. It can be a Smart Contract or a Wallet
 * @param {Array<string>} address_tos The "to" addresses you want to check
 * @param {object} config Configuration for this bot
 * @returns {Promise<void>}
 */
const run = async (address_from, address_tos, config) => {

    console.log("Using this config:", config, "\n");

    const ABIs = await getABIsForContracts(address_tos, config.etherscan_api);
    const abiCoder = new ethers.utils.AbiCoder()

    if (config.alchemy_api) {
        // var provider = new ethers.providers.JsonRpcProvider(
        //     "https://lively-twilight-arrow.discover.quiknode.pro/907967c0f97c504d76e838673688a3ad9c456039/"
        // )
        // var provider = new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/")
        // var provider = new ethers.providers.InfuraProvider(null, config.etherscan_api)
    } else {
        console.error("Invalid alchemy_api was given! Update config and try again...");
        process.exit(1);
    }

    console.info("Connected with the provider!");

    // `authSigner` is an Ethereum private key that does NOT store funds and is NOT your bot's primary key.
    // This is an identifying key for signing payloads to establish reputation and whitelisting
    // In production, this should be used across multiple bundles to build relationship. In this example, we generate a new wallet each time
    const authSigner = new ethers.Wallet("2327a64986acea02d85e34e13e6bbc46e3f13f92f10cd3e2858aa14ee16c5b43");

    // Flashbots provider requires passing in a standard provider
    const flashbotsProvider = await FlashbotsBundleProvider.create(
        provider, // a normal ethers.js provider, to perform gas estimiations and nonce lookups
        authSigner // ethers.js signer wallet, only for signing request payloads, not transactions
    )

    const wallet = new ethers.Wallet(config.private_key);
    console.log("Connected with the Wallet:", wallet.address);

    console.info("Monitoring Mempool...");
    console.info("\n");

    provider.on('pending', async (txnData) => {
        // console.log(tx);
        // const txnData = await provider.getTransaction(tx.hash);
        // if (txnData) {
        console.log("Tx Hash:", txnData.hash);
        if (txnData.from.toLowerCase() == address_from) {
            for (let i = 0; i < address_tos.length; i++) {
                const address_to = address_tos[i].trim().toLowerCase();
                if (txnData.to.toLowerCase() == address_to) {
                    console.log("\n");
                    console.log("New tx found in mempool!");
                    console.log(txnData.toJSON());
                    console.log("Starting front-run process for the above tx...");

                    const decodedTxnData = abiCoder.decode(ABIs[address_to], txnData.data);
                    console.log(decodedTxnData);

                    // const txRes = await flashbotsProvider.sendPrivateTransaction({ transaction: {}, signer: wallet });
                    // const receipts = await txRes.receipts();
                    // console.log(receipts[0])
                }
            }
        }
        // }
    })
}

(async () => {
    const config = loadConfigFile();
    await run(config.address_from, config.address_tos, config)
})();
