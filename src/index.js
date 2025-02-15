/*
  # This Source Code Form is subject to the terms of the Mozilla Public
  # License, v. 2.0. If a copy of the MPL was not distributed with this
  # file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

'use strict';

let isFullnode = false;
let isScanningBlocks = false;
let nCacheHeight = 0;

// A getter-pointer function for the block count
function getBlockcount() {
    return nCacheHeight;
}

// A getter-pointer function for the fullnode flag
function isFullnodePtr() {
    return isFullnode;
}

// A getter-pointer function for the fullnode flag
function isHeadless() {
    return typeof Window === 'undefined';
}

// Flag to specify if the client is outdated according to external sources (i.e; Github API)
let isOutdated = false;

let npmPackage;
// Main Modules
let DB, NET, RPC, TOKENS, NFT, WALLET, UPGRADES, VM;
// API Modules
let apiACTIVITY, apiBLOCKCHAIN, apiTOKENS, apiWALLET, apiIO;
try {
// GUI
    DB = require('../src/database/index.js');
    NET = require('../src/network.js');
    RPC = require('../src/rpc.js');
    TOKENS = require('../src/token.js');
    NFT = require('../src/nft.js');
    WALLET = require('../src/wallet.js');
    UPGRADES = require('../src/upgrades.js');
    VM = require('../src/vm.js');
    apiACTIVITY = require('../src/api/activity.routes.js');
    apiBLOCKCHAIN = require('../src/api/blockchain.routes.js');
    apiTOKENS = require('../src/api/tokens.routes.js');
    apiWALLET = require('../src/api/wallet.routes.js');
    apiIO = require('../src/api/io.routes.js');
    // It's more tricky to fetch the package.json file when GUI-packed, so... here's the workaround!
    try {
        // Unpacked
        let strFile;
        try {
            // starting index.js from /src/..
            strFile = DB.fs.readFileSync('../package.json', 'utf8');
        } catch(e) {
            // starting index.js from root directory
            strFile = DB.fs.readFileSync('package.json', 'utf8');
        }
        npmPackage = JSON.parse(strFile);
    } catch(e) {
        try {
            // Packed
            const strFile = DB.fs.readFileSync(process.cwd() +
                                               '\\resources\\app\\package.json',
            'utf8');
            npmPackage = JSON.parse(strFile);
        } catch(ee) {
            // NPM package is hiding somewhere unusual... but we can live without it!
            console.warn(e);
        }
    }
} catch(e) {
    // Terminal
    try {
        DB = require('./database/index.js');
        NET = require('./network.js');
        RPC = require('./rpc.js');
        TOKENS = require('./token.js');
        NFT = require('./nft.js');
        WALLET = require('./wallet.js');
        UPGRADES = require('./upgrades.js');
        VM = require('./vm.js');
        apiACTIVITY = require('./api/activity.routes.js');
        apiBLOCKCHAIN = require('./api/blockchain.routes.js');
        apiTOKENS = require('./api/tokens.routes.js');
        apiWALLET = require('./api/wallet.routes.js');
        apiIO = require('./api/io.routes.js');
        npmPackage = JSON.parse(DB.fs.readFileSync('../package.json', 'utf8'));
    } catch(ee) {
        // At this point, we have no idea what's causing the error, bail out!
        console.error('CRITICAL INITIALIZATION ERROR!\nThis error was not ' +
                      'caught and/or handled properly, this may need ' +
                      'reporting to the developer!');
        console.error(e);
        console.error(ee);
    }
}

const rpcMain = RPC;

if (npmPackage) {
    console.log('--- StakeCube Protocol (SCP) Wallet v' + npmPackage.version +
                ' --- ' + (!isHeadless() ? 'GUI Mode' : ''));
    // Check if we're running the latest version
    NET.getLatestRelease().then(res => {
        res = JSON.parse(res);
        // If this is a draft or pre-release, just ignore it for now
        if (!res.draft && !res.prerelease) {
            const nWebVersion = Number(res.tag_name
                .replace('v', '')
                .replace(/\./g, ''));
            const nOurVersion = Number(npmPackage.version
                .replace('v', '')
                .replace(/\./g, ''));
            if (Number.isFinite(nWebVersion) && Number.isInteger(nWebVersion)) {
                if (nWebVersion > nOurVersion) {
                    // New version is released! We're running older software
                    isOutdated = true;
                }
            }
        }

        if (isOutdated) {
            console.warn('NEW VERSION AVAILABLE! (' + res.tag_name +
                         ')\nDownload the update on Github!');
        }
    });
} else {
    console.warn("Init: Unable to load npmPackage data... this won't cause " +
                 "major issues, don't worry!");
}

// The first SCP block
const nFirstBlock = 155084;

// The amount of satoshis that make a full coin
const COIN = 100000000;

// The default REST API port
const nDefaultApiPort = 3000;

// The SCP deployment fee, in SCC
const nDeployFee = 10;
const strDeployFeeDest = 'sccburnaddressXXXXXXXXXXXXXXSfqakF';

// Express Server
const express = require('express');
const app = express();
app.use(express.raw({
    'type': () => {
        return true;
    }
}));
let fInitialized = false;

async function init(forcedCorePath = false, retry = false) {
    try {
        // Initialize the DB, load configs into memory
        await DB.init(forcedCorePath, retry);
        // Initialize the NFTs module with necessary pointers
        NFT.init(getBlockcount);
        // Load which caller addresses (if any) can call the API
        const arrAllowedCallers = DB.getConfigValue('allowedips', '127.0.0.1',
            false)
            .replace(/::ffff:/g, '')
            .replace(/ /g, '')
            .split(',');
        // Initialize API modules, providing mutable pointer contexts to all necessary states
        if (!fInitialized) {
            fInitialized = true;
            const arrEnabledModules = [];
            const fApiActivity = apiACTIVITY.init(app, {
                'callers': arrAllowedCallers,
                'TOKENS': TOKENS,
                'DB': DB,
                'UPGRADES': UPGRADES,
                'getBlockcount': getBlockcount,
                'gfm': getFullMempool,
                'rpcMain': rpcMain,
                'isFullnode': isFullnodePtr
            });
            const fApiBlockchain = apiBLOCKCHAIN.init(app, {
                'callers': arrAllowedCallers,
                'gfm': getFullMempool,
                'DB': DB,
                'isFullnode': isFullnodePtr
            });
            const fApiTokens = apiTOKENS.init(app, {
                'callers': arrAllowedCallers,
                'TOKENS': TOKENS,
                'DB': DB,
                'NFT': NFT,
                'isFullnode': isFullnodePtr
            });
            const fApiWallet = apiWALLET.init(app, {
                'callers': arrAllowedCallers,
                'TOKENS': TOKENS,
                'WALLET': WALLET,
                'DB': DB,
                'NFT': NFT,
                'isFullnode': isFullnodePtr,
                'COIN': COIN,
                'nDeployFee': nDeployFee,
                'strDeployFeeDest': strDeployFeeDest
            });
            const fApiIO = apiIO.init(app, {
                'callers': arrAllowedCallers,
                'WALLET': WALLET,
                'DB': DB,
                'VM': VM,
                'getMsgFromTx': getMsgFromTx,
                'isFullnode': isFullnodePtr,
                'COIN': COIN
            });
            if (fApiActivity) arrEnabledModules.push('activity');
            if (fApiBlockchain) arrEnabledModules.push('blockchain');
            if (fApiTokens) arrEnabledModules.push('tokens');
            if (fApiWallet) arrEnabledModules.push('wallet');
            if (fApiIO) arrEnabledModules.push('io');

            // Load API port from config, use default if none exists, or fallback to default if the port is a non-int
            let nApiPort = Number(DB.getConfigValue('apiport', nDefaultApiPort,
                false));
            if (!Number.isSafeInteger(nApiPort)) nApiPort = nDefaultApiPort;
            app.listen(nApiPort);
            const strPortType = (nDefaultApiPort === nApiPort
                ? 'default'
                : 'custom');
            console.log('API: Listening on ' + strPortType + ' port!' +
                        ' (' + nApiPort + ')');
            // Log our module statuses
            if (arrEnabledModules.length) {
                console.log('API exposed to: ' + arrAllowedCallers.join(', '));
                console.log('API: ' + arrEnabledModules.length + ' modules ' +
                            'enabled! (' + arrEnabledModules.join(', ') + ')');
            } else {
                console.log('API: Disabled! You can enable individual ' +
                            'modules using "apimodules=mod1,mod2,..."');
            }

            // Load the wallet DB
            const rawDBWallet = await DB.getWallet();
            if (rawDBWallet) {
                // Check which format we're using (pre-v1.1.4, or above)
                if (rawDBWallet.wallets && rawDBWallet.wallets.length > 0) {
                    // New format
                    for (const rawWallet of rawDBWallet.wallets) {
                        const cWallet = new WALLET.Wallet(rawWallet.pubkey,
                            rawWallet.privkeyDecrypted,
                            rawWallet.privkeyEncrypted);
                        WALLET.addWallet(cWallet);
                    }
                } else {
                    // Old format
                    const cWallet = new WALLET.Wallet(rawDBWallet.pubkey,
                        rawDBWallet.privkeyDecrypted,
                        rawDBWallet.privkeyEncrypted);
                    WALLET.addWallet(cWallet);
                }
                // Set 2FA (resides in the root object, regardless of wallet format)
                WALLET.set2FAkey(rawDBWallet.opt2FA);
                // Log the amount of wallets we've loaded
                const nWalletCount = WALLET.countWallets();
                console.log('Init: Loaded ' + nWalletCount + ' wallet' +
                            (nWalletCount !== 1 ? 's' : '') + '!');
            }
        }

        // Prepare RPC connection
        const arrErr = [];
        const arrWarn = [];

        // A TX Index is required to retrieve raw transaction information from the chain, this is required to use SC-Protocol
        const txindex = DB.getConfigValue('txindex', false);
        if (!txindex || Number(txindex) !== 1) {
            arrErr.push('Config: No txindex enabled: txindex=0');
        }

        const addrIndex = DB.getConfigValue('addressindex', false);
        if (!addrIndex || Number(addrIndex) !== 1) {
            arrWarn.push('Config: No address index: addressindex=0,' +
                      ' enable to use SCC-related modules.');
        }

        const server = DB.getConfigValue('server', false);
        if (!server || Number(server) !== 1) {
            arrErr.push('Config: No RPC server enabled: server=0');
        }

        const rpcUser = DB.getConfigValue('rpcuser', false);
        if (!rpcUser) {
            arrErr.push('Config: No rpcuser found: rpcuser=xyz');
        }

        const rpcPass = DB.getConfigValue('rpcpassword', false);
        if (!rpcPass) {
            arrErr.push('Config: No rpcpassword found: rpcpassword=zyx');
        }

        const rpcPort = DB.getConfigValue('rpcport', 39999);
        if (!rpcPort) {
            arrErr.push('Config: No rpcport found: rpcport=39999');
        }

        rpcMain.auth(rpcUser, rpcPass, 'localhost', rpcPort);
        // Initialize the wallet with the new RPC class and system contexts
        WALLET.init({
            'isHeadless': isHeadless,
            'gfm': getFullMempool,
            'rpcMain': rpcMain,
            'COIN': COIN
        });

        // Test the RPC connection
        let uptime;
        try {
            uptime = await rpcMain.call('uptime');
        } catch(e) {
            // Silently ignore
        } finally {
            if (!Number.isFinite(Number(uptime))) {
                const strConnType = arrErr.length > 1 ? 'Config' : 'RPC';
                arrErr.push('RPC: Unable to connect to SCC Core.');
                if (arrErr[0] && !retry) {
                    console.log('--- ERRORS ---');
                    arrErr.map(a => console.log(a));
                }
                if (arrWarn[0] && !retry) {
                    console.log('--- WARNINGS ---');
                    arrWarn.map(a => console.log(a));
                }

                if (arrErr[0] && !retry) {
                    console.log('--- NOTICE ---');
                    if (isHeadless()) {
                        console.log('Critical ' +
                                    strConnType + ' errors found. ' +
                                    'Once these errors are fixed, SCP Wallet' +
                                    ' will automatically reconnect.');
                    } else {
                        console.log('SCP Wallet will use Fallback servers to' +
                        ' preserve a smooth GUI experience, if you are happy' +
                        ' using the Lightwallet, don\'t worry, everything is' +
                        ' fine!');
                    }
                }

                setTimeout(() => {
                    init(forcedCorePath, true);
                }, 5000);
            } else {
                // RPC Connection successful!
                isFullnode = true;
                console.log('Init: Finished - Running as Fullnode! (Syncing)');
            }
        }
    } catch(e) {
        console.error('Init: FATAL ERROR!');
        console.error(e);
    }
}

// If we're on Windows; check the registry for SCC Core's data directory
if (process.platform === 'win32') {
    // We only load Regedit if we're on win32, no point in requiring regedit on non-win32 systems
    const regedit = require('regedit');
    const regPath = 'HKCU\\Software\\StakeCubeCoin\\SCC-Qt';
    let regCorePath;
    regedit.list(regPath, function(err, result) {
        if (err || !result[regPath] || !result[regPath].values) {
            if (err) console.warn(err);
            console.warn('Registry: Unable to read SCC-Qt registry!');
            init();
        } else {
            const res = result[regPath].values;
            // No errors; ensure the registries and paths are available
            const pathExists = res && res.strDataDir && res.strDataDir.value;
            if (pathExists && res.strDataDir.value.length > 1) {
                // We found the StakeCubeCoin Core datadir!
                // Make sure the trailing seperator isn't missing
                regCorePath = res.strDataDir.value;
                if (!regCorePath.endsWith(DB.path.sep)) {
                    regCorePath += DB.path.sep;
                }
                console.log('Registry: Detected data directory from registry!');
                init(regCorePath);
            } else {
                // Failed to find the registry datadir, initializing with defaults...
                console.warn('Registry: Unable to read SCC-Qt registry!');
                init();
            }
        }
    });
} else {
// Otherwise, just initialize straight away!
    init();
}

const chainMessages = [];
const chainHashesCache = [];
let nCacheScannedBlks = 0;
let currentScanBlock = null;
async function getMsgsFromChain(nBlocksTotal, rescanPossible = false) {
    // Set the Sync Assist state pointer
    DB.state.setStateMsgPtr(chainMessages);
    isScanningBlocks = true;
    currentScanBlock = null;
    // Check for a Sync Assist file
    const arrSyncBlks = await DB.getSyncAssistSnap();
    let fSyncAssist = !rescanPossible &&
                      arrSyncBlks && Array.isArray(arrSyncBlks);
    const nBestSyncBlk = fSyncAssist ? arrSyncBlks[arrSyncBlks.length - 1] : 0;
    let nBestBlock = await rpcMain.call('getbestblockhash');
    nBestBlock = await rpcMain.call('getblock', nBestBlock);
    const nStartBlock = nBestBlock.height - nBlocksTotal;
    console.log('Scanning block range ' + nStartBlock + ' to ' +
                nBestBlock.height + ' (Total: ' + nBlocksTotal + ')');
    if (fSyncAssist) {
        console.log('Sync Assist enabled! Scanning ' + arrSyncBlks.length +
                    ' assisted blocks!');
    }
    let i; const len = nBestBlock.height + 1;
    for (i = nStartBlock; i < len; i++) {
        if (fSyncAssist && !rescanPossible) {
            // If the current block height is NOT logged in Sync Assist, and the current block height
            // ... is smaller than the highest Sync Assist block, skip it!
            if (!arrSyncBlks.includes(i) && i <= nBestSyncBlk) {
                // Emulate a block tick
                nCacheHeight = i;
                nCacheScannedBlks++;
                TOKENS.setBlockHeight(nCacheHeight);
                continue;
            } else if (i > nBestSyncBlk) {
                fSyncAssist = false;
                console.log('Sync Assist finished, resuming regular ' +
                            'synchronization.');
            }
        }
        // Optimization note:
        // If we've started a new scan, clear currentScanBlock and pull the fresh block data from RPC
        // ... if we're doing a long scan, we cache the last block and rely on 'nextblockhash' for
        // ... faster querying, as it removes the need to call 'getblockhash' on every loop tick
        let currentScanHash = null;
        if (fSyncAssist || isNil(currentScanBlock)) {
            currentScanHash = await rpcMain.call('getblockhash', i);
        } else {
            currentScanHash = currentScanBlock.nextblockhash;
        }
        // (Rescan Only) Skip blocks if we've already scanned them before
        // If we're CERTAIN we won't re-scan old blocks, skip this for performance.
        if (rescanPossible) {
            if (chainHashesCache.includes(currentScanHash)) continue;
        }
        // Grab the block from RPC, cache it to save on future requests
        currentScanBlock = await rpcMain.call('getblock', currentScanHash);
        nCacheHeight = currentScanBlock.height;
        await getMsgsFromBlock(currentScanBlock);
    }
    console.log('Scan done!');
    isScanningBlocks = false;
}

async function getMsgsFromBlock(blk) {
    if (blk === null || blk === undefined) return null;
    chainHashesCache.push(blk.hash);
    nCacheScannedBlks++;
    if (chainHashesCache.length > 100) chainHashesCache.shift();
    TOKENS.setBlockHeight(blk.height);
    if (blk.nTx === 1) return null;

    for (const cTx of blk.tx) {
        const txRes = await getMsgFromTx(cTx);
        if (txRes === null || !txRes.msg.length) continue;
        if (txRes.error) return console.error(txRes);
        // Process the new state
        try {
            await processState(txRes.msg, txRes.tx);
        } catch(e) {
            console.error('processState() failure !!!\n Block: ' + blk.hash +
                          ' (' + blk.height + ')\n TX: ' + cTx);
            console.error(e);
        }
        // Cache this message and block
        chainMessages.push({
            'msg': txRes.msg,
            'height': blk.height,
            'tx': cTx
        });
    }
    return true;
}

async function getMsgFromTx(rawTX, useCache = false, strFormat = 'utf8') {
    let res;
    try {
        res = await (useCache
            ? getRawTx(rawTX)
            : rpcMain.call('getrawtransaction', rawTX, 1));
    } catch(e) {
        return {
            'error': true,
            'message': 'Unable to fetch raw transaction, insufficient ' +
                            'TX indexing',
            'id': 7
        };
    }
    if (isNil(res)) {
        return {
            'error': true,
            'message': 'Unable to fetch raw transaction, ' +
                                           'insufficient TX indexing',
            'id': 7
        };
    }
    for (const cVout of res.vout) {
        if (!cVout.scriptPubKey) continue;
        if (!cVout.scriptPubKey.hex) continue;
        // Scan the scriptPubKey for OP_RETURN (+ PUSHDATA)
        if (cVout.scriptPubKey.hex.startsWith('6a4c')) {
            // Found an OP_RETURN! Parse the message from HEX to UTF-8
            const rawHex = cVout.scriptPubKey.asm.substr(10);
            const buf = Buffer.from(rawHex, 'hex');
            return {
                'msg': buf.toString(strFormat),
                'tx': res
            };
        }
    }
    return null;
}

const arrRawTxCache = [];
async function getRawTx(strID) {
    const cCache = arrRawTxCache.find(a => a.txid === strID);
    if (cCache) return cCache;
    // TX not cached, fetch it the long way and cache it!
    const cTx = await rpcMain.call('getrawtransaction', strID, 1);
    // Only cache TXs that are InstantLock'd, for security
    if (cTx.instantlock || cTx.chainlock) {
        arrRawTxCache.unshift(cTx);
    }
    // Ensure the cache doesn't grow "too" big
    if (arrRawTxCache.length > 10000) arrRawTxCache.pop();
    // Return the cached result
    return arrRawTxCache[0];
}

async function getFullMempool() {
    const arrFullMempool = [];
    const arrMempool = await rpcMain.call('getrawmempool');
    for (const cTX of arrMempool) {
        arrFullMempool.push(await rpcMain.call('getrawtransaction', cTX, 1));
    }
    return arrFullMempool;
}

// Deterministically Authenticate a contract interaction via it's inputs
async function isCallAuthorized(cTx, strAuthAddr) {
    for (const cVin of cTx.vin) {
        // Fetch the VIN raw tx
        const vinTx = await getRawTx(cVin.txid);
        // Ensure all vins are from the 'authAddr' address
        const strVinAddr = vinTx.vout[cVin.vout].scriptPubKey.addresses[0];
        if (strVinAddr !== strAuthAddr) {
            return false;
        }
    }
    // If we reach here, all inputs were from the given address!
    return true;
}

// Chain State Processing
async function processState(newMsg, tx) {
    // Attempt to run the data as a contract's bytecode
    const vmRet = await VM.run(tx, newMsg);
    // If this returns true, it means the TX successfully executed as VM bytecode
    if (vmRet === true) return true;

    // If the code reaches here, it's likely a non-bytecode (hardcoded) protocol call
    const isLongData = newMsg.length > 64;
    let isUsingIndex = false;
    if (UPGRADES.isTokenIndexingActive(nCacheHeight)) {
        isUsingIndex = newMsg.startsWith('id');
    }
    // SCP Token: CREATE
    // Create a new SCP-predefined token, with name, ticker and max supply
    if (!isUsingIndex && newMsg.startsWith('SCPCREATE')) {
        /*
            --- SCP-1 ---
            param 0 = VERSION (int)
            param 1 = NAME (str)
            param 2 = TICKER (str)
            param 3 = MAXSUPPLY (int)
            --- SCP-2 ---
            param 0 = VERSION (int)
            param 1 = NAME (str)
            param 2 = TICKER (str)
            param 3 = MAXSUPPLY (int)
            param 4 = INFLATION (int)
            param 5 = MINAGE (int)
            --- SCP-3 ---
            TBD
            --- SCP-4 ---
            param 0 = VERSION (int)
            param 1 = COLLECTIONNAME (str)
            param 2 = MAXMINTS (int) # -1 for no max mints
            param 3 = PROTECTED (bool flag) # 1 for true, 0 for false
        */
        const arrParams = newMsg.split(' ');
        let nVersion = -1;
        let nExpectedParams = -1;

        if (arrParams[0] !== 'SCPCREATE') {
            const arrVersion = Number(arrParams[0].substr(9));

            switch (arrVersion) {
            case 1: // SCP-1 Token
                nVersion = 1;
                nExpectedParams = 4;
                break;
            case 2: // SCP-2 Token
                nVersion = 2;
                nExpectedParams = 6;
                break;
            case 3: // Not defined yet
                nVersion = 3;
                nExpectedParams = -1;
                break;
            case 4: // SCP-4 NFT
                nVersion = 4;
                nExpectedParams = 4;
                break;
            }
        }

        // Ensure we have the correct amount of params
        if (arrParams.length === nExpectedParams) {
            // Sanity checks
            let sCheck = false;
            let check1 = false;
            let check2 = false;
            let check3 = false;
            let check4 = false;
            let check5 = false;

            switch (nVersion) {
            case 1: // SCP-1 Token
                check1 = arrParams[1].length > 0;
                check2 = arrParams[2].length > 0;
                check3 = Number(arrParams[3]);
                check3 = (check3 > 0 && Number.isSafeInteger(check3));
                if (check1 && check2 && check3) sCheck = true;
                break;
            case 2: // SCP-2 Token
                check1 = arrParams[1].length > 0;
                check2 = arrParams[2].length > 0;
                check3 = Number(arrParams[3]);
                check3 = (check3 > 0 && Number.isSafeInteger(check3));
                check4 = Number(arrParams[4]);
                check5 = Number(arrParams[5]);
                check4 = (check4 > 1 && Number.isSafeInteger(check4)); // SCP-2 inflation
                check5 = (check5 > 1 && Number.isSafeInteger(check5)); // SCP-2 minimum age (in blocks) to stake
                if (check1 && check2 && check3 && check4 && check5) {
                    sCheck = true;
                }
                break;
            case 3: // Not defined yet
                break;
            case 4: // SCP-4 NFT
                check1 = arrParams[1].length > 0;
                check2 = Number(arrParams[2]);
                check2 = (check2 === -1 || (check2 > 0 &&
                                            Number.isSafeInteger(check2))); // SCP-4 max mints
                if (check1 && check2) sCheck = true;
                break;
            }

            if (sCheck) {
                // Params look good, now verify outputs
                try {
                    // Grab change output (last vout) --> Ensure change output is the contract issuer
                    const voutCaller = tx.vout[tx.vout.length - 1];
                    const addrCaller = voutCaller.scriptPubKey.addresses[0];
                    if (isEmpty(addrCaller)) {
                        throw Error('Missing creator address!');
                    }
                    // Verify the deployment fee output
                    const voutFee = tx.vout[1];
                    const hasPubkey = voutFee &&
                                    voutFee.scriptPubKey &&
                                    voutFee.scriptPubKey.addresses[0];
                    const hasFee = voutFee.value >= nDeployFee;
                    if (hasPubkey && hasFee) {
                        // Ensure the fee pubkey matches the public burn address
                        const feePubkey = voutFee.scriptPubKey.addresses[0];
                        if (feePubkey !== strDeployFeeDest) {
                            throw Error('Deployment fee output is invalid!');
                        }
                        let newContract;
                        if (nVersion === 1) {
                            newContract = new TOKENS.SCP1Token(tx.txid,
                                arrParams[1],
                                arrParams[2],
                                Number(arrParams[3]),
                                addrCaller,
                                []);

                            TOKENS.addToken(newContract);
                        }
                        if (nVersion === 2) {
                            newContract = new TOKENS.SCP2Token(tx.txid,
                                arrParams[1],
                                arrParams[2],
                                Number(arrParams[3]),
                                addrCaller,
                                [],
                                Number(arrParams[4]),
                                Number(arrParams[5]));

                            TOKENS.addToken(newContract);
                        }
                        const fV4Active = UPGRADES.isScp4Active(nCacheHeight);
                        if (nVersion === 4 && fV4Active) {
                            // Protected (bool flag)
                            // NFTs in protected Collections can **not** be burned / destroyed by owners
                            // Setting it to false/0 allows creating SCP-4 contracts with destructable NFTs
                            let colProtected = true;
                            if (arrParams[3] === '0') {
                                colProtected = false;
                            } else if (arrParams[3] !== '1') {
                                throw Error('SCP-4 Param "protected" must be' +
                                            ' 0 or 1! Input "' + arrParams[3] +
                                            '" is invalid!');
                            }

                            newContract = new NFT.SCP4(tx.txid,
                                arrParams[1],
                                Number(arrParams[2]),
                                colProtected,
                                addrCaller,
                                []);

                            NFT.addCollection(newContract, nCacheHeight);
                        }

                        if (newContract) {
                            console.log('New SCP-' + nVersion +
                                        ' contract created!');
                            console.log(newContract);
                        }
                    } else {
                        console.warn('An attempt to create a new SCP-' +
                                     nVersion + ' contract has failed, ' +
                                     'invalid fee output!');
                    }
                } catch(e) {
                    console.warn('An attempt to create a new SCP-' +
                                 nVersion + ' contract has failed, failed ' +
                                 'to verify outputs!');
                    console.error(e);
                }
            } else {
                console.warn('An attempt to create a new SCP-' + nVersion +
                             ' contract has failed, incorrect params!');
            }
        } else {
            console.warn('An attempt to create a new SCP-' + nVersion +
                         ' contract has failed, incorrect param count! (has ' +
                         arrParams.length + ', expected ' + nExpectedParams +
                         ')\nTX: ' + tx.txid);
        }
    } else if (isLongData || isUsingIndex) {
        // Contract write operation
        /*
            param 0 = TXID || Index (txid str || index int)
            param 1 = METHOD (contract method)
        */
        const arrParams = newMsg.split(' ');
        let idContract = arrParams[0];
        // Sanity check
        let check1 = idContract.length === 64;
        if (isUsingIndex) {
            // If we're using an index, ensure our ID is a safe, parsed integer
            idContract = Number(arrParams[0].substr(2));
            if (idContract >= 0 && Number.isSafeInteger(idContract)) {
                check1 = true;
            } else {
                check1 = false;
            }
        }
        const check2 = !isEmpty(arrParams[1]);
        if (check1 && check2) {
            // Fetch the contract being called
            // One of them is empty for now.
            // TODO: improve and check what contract type it is
            const cToken = TOKENS.getToken(idContract);
            const cCollection = NFT.getCollection(idContract);

            if (cToken && !cToken.error) {
                // SCP TOKEN MINTING (Create new tokens on-demand, issuer-only, cannot mint above predefined max supply)
                if (arrParams[1] === 'mint') {
                    /*
                        param 2 = AMOUNT (satoshi int)
                    */
                    if (cToken.version === 2) {
                        // SCP-2 tokens can only mint a single time
                        // The first 'owner' is ALWAYS the issuer, thus, if there's atleast one owner
                        // ... then a mint has already taken place, no rug-pulls today, sir!
                        if (cToken.owners.length > 0) return true;
                    }
                    const nCheck3 = Number(arrParams[2]);
                    const check3 = (nCheck3 > 0 &&
                                    Number.isSafeInteger(nCheck3));
                    if (check3) {
                        // Grab change output --> Ensure change output is the token issuer
                        const addrCaller = tx.vout[1]
                            .scriptPubKey.addresses[0];
                        if (isEmpty(addrCaller)) {
                            throw Error('Missing creator address!');
                        }
                        // Check the change output against the token issuer
                        if (addrCaller === cToken.creator) {
                            // Authentication: Ensure all inputs of the TX are from the issuer
                            const fSafe = await isCallAuthorized(tx,
                                addrCaller);
                            if (fSafe) {
                                // Authentication successful, minting tokens!
                                cToken.creditAccount(cToken.creator, nCheck3,
                                    tx);
                            } else {
                                console.error('An attempt to mint SCP-' +
                                              cToken.version + ' ' +
                                              'containing a non-issuer input ' +
                                              'was detected, ignoring ' +
                                              'request...');
                            }
                        } else {
                            console.error('An attempt by a non-issuer to mint' +
                                          ' SCP-' + cToken.version + ' tokens' +
                                          ' failed! (Issuer: ' +
                                          cToken.creator.substr(0, 5) + '... ' +
                                          'Caller: ' + addrCaller.substr(0, 5) +
                                          '...)');
                        }
                    } else {
                        console.error('An attempt to mint SCP-' +
                                      cToken.version + ' tokens failed! ' +
                                      '(Token: ' + cToken.name +
                                      ', amount: ' + arrParams[2] + ')');
                    }
                } else if (arrParams[1] === 'burn') {
                    // SCP TOKEN BURNING (Burn tokens from your account balance, usable by anyone, cannot burn more than your available balance)
                    /*
                        param 2 = AMOUNT (satoshi int)
                    */
                    const nCheck3 = Number(arrParams[2]);
                    const check3 = (nCheck3 > 0 &&
                                    Number.isSafeInteger(nCheck3));
                    if (check3) {
                        // Fetch the change output of the contract call TX, assume the change output is the caller.
                        const addrCaller = tx.vout[1]
                            .scriptPubKey.addresses[0];
                        if (isEmpty(addrCaller)) {
                            throw Error('Missing caller address!');
                        }
                        // Authentication: Ensure all inputs of the TX are from the caller
                        const fSafe = await isCallAuthorized(tx,
                            addrCaller);
                        if (fSafe) {
                            // Authentication successful, burning tokens!
                            cToken.debitAccount(addrCaller, nCheck3, tx);
                        } else {
                            console.error('An attempt to burn SCP-' +
                                          cToken.version + ' containing a ' +
                                          'non-issuer input was detected, ' +
                                          'ignoring request...');
                        }
                    } else {
                        console.error('An attempt to burn SCP-' +
                                      cToken.version + ' tokens' +
                                      ' failed! (Token: ' + cToken.name +
                                      ', amount: ' + arrParams[2] + ')');
                    }
                } else if (arrParams[1] === 'send') {
                    // SCP TOKEN SENDS (Transfer tokens to another account, usable by anyone, cannot send more than your available balance)
                    /*
                        param 2 = AMOUNT (satoshi int)
                        param 3 = RECEIVER (address str)
                    */
                    // Fetch the change output of the contract call TX, assume the change output is the caller.
                    const addrCaller = tx.vout[1].scriptPubKey.addresses[0];
                    if (isEmpty(addrCaller)) {
                        throw Error('Missing caller address!');
                    }
                    // Run sanity checks
                    const nCheck3 = Number(arrParams[2]);
                    const check3 = (nCheck3 > 0 &&
                                    Number.isSafeInteger(nCheck3));
                    const check4 = (await rpcMain.call('validateaddress',
                        arrParams[3])).isvalid;
                    if (check3 && check4 === true) {
                        // Authentication: Ensure all inputs of the TX are from the caller
                        const fSafe = await isCallAuthorized(tx,
                            addrCaller);
                        if (fSafe) {
                            // Authentication successful, burning tokens!
                            cToken.transfer(addrCaller, arrParams[3], nCheck3,
                                tx);
                        } else {
                            console.error('An attempt to transfer SCP-' +
                                          cToken.version + ' containing a ' +
                                          'non-caller input was detected, ' +
                                          'ignoring request...');
                        }
                    } else {
                        console.error('An attempt to transfer SCP-' +
                                      cToken.version + ' tokens failed! ' +
                                      '(Token: ' + cToken.name + ', from ' +
                                      addrCaller.substr(0, 5) + ', to ' +
                                      arrParams[3].substr(0, 5) + ', amount:' +
                                      ' ' + arrParams[2] + ')');
                    }
                } else if (cToken.version === 2 && arrParams[1] === 'redeem') {
                    // SCP-2 TOKEN STAKING (Redeem an amount of unclaimed balance, credited from staking rewards)
                    // Fetch the change output of the contract call TX, assume the change output is the caller.
                    const addrCaller = tx.vout[1].scriptPubKey.addresses[0];
                    if (isEmpty(addrCaller)) {
                        throw Error('Missing caller address!');
                    }
                    // Authentication: Ensure all inputs of the TX are from the caller
                    const fSafe = await isCallAuthorized(tx, addrCaller);
                    if (fSafe) {
                        // Authentication successful, redeeming tokens!
                        cToken.redeemRewards(cToken.getAccount(addrCaller), tx);
                    } else {
                        console.error('An attempt to redeem SCP-' +
                                      cToken.version + ' stakes containing ' +
                                      'a non-issuer input was detected, ' +
                                      'ignoring request...');
                    }
                }
            }

            if (cCollection && !cCollection.error) {
                // SCP NFT MINTING (Create new NFT for the collection, issuer-only)
                if (arrParams[1] === 'mint') {
                    /*
                        param 2 = NAME (string)
                        param 3 = IPFS_ID (string)
                    */
                    const check3 = arrParams[2] && arrParams[2].length > 1;
                    const check4 = arrParams[3] && arrParams[3].length > 1; // TODO: Improve _url_ validation

                    if (check3 && check4) {
                        // Grab change output --> Ensure change output is the contract issuer
                        const addrCaller = tx.vout[1]
                            .scriptPubKey.addresses[0];
                        if (isEmpty(addrCaller)) {
                            throw Error('Missing creator address!');
                        }
                        // Check the change output against the NFT issuer
                        if (addrCaller === cCollection.creator) {
                            // Authentication: Ensure all inputs of the TX are from the issuer
                            const fSafe = await isCallAuthorized(tx,
                                addrCaller);
                            if (fSafe) {
                                // Authentication successful, mint NFT!
                                cCollection.mintNFT(cCollection.creator,
                                    arrParams[2], arrParams[3],
                                    tx);
                            } else {
                                console.warn('An attempt to mint SCP-' +
                                              cCollection.version + ' ' +
                                              'containing a non-issuer input ' +
                                              'was detected, ignoring ' +
                                              'request...');
                            }
                        } else {
                            console.warn('An attempt by a non-issuer to mint' +
                                          ' SCP-' + cCollection.version +
                                          ' NFT failed! (Issuer: ' +
                                          cCollection.creator.substr(0, 5) +
                                          '... Caller: ' +
                                          addrCaller.substr(0, 5) + '...)');
                        }
                    } else {
                        console.warn('An attempt to mint SCP-' +
                                      cCollection.version +
                                      ' NFT failed: no valid name and/or ' +
                                      'image url given! (Collection: ' +
                                      cCollection.collectionName + ')');
                    }
                } else if (arrParams[1] === 'transfer') {
                    // SCP NFT TRANSFER (Transfer NFT to another account, usable by anyone)
                    /*
                        param 2 = RECEIVER (address str)
                        param 3 = NFTID (str)
                    */
                    // Fetch the change output of the contract call TX, assume the change output is the caller.
                    const addrCaller = tx.vout[1].scriptPubKey.addresses[0];
                    if (isEmpty(addrCaller)) {
                        throw Error('Missing caller address!');
                    }
                    // Run sanity checks
                    const check3 = arrParams[2] && (await rpcMain
                        .call(
                            'validateaddress',
                            arrParams[2]))
                        .isvalid;
                    const check4 = arrParams[3] && arrParams[3].length === 64;

                    if (check3 && check4) {
                        // Authentication: Ensure all inputs of the TX are from the caller
                        const fSafe = await isCallAuthorized(tx, addrCaller);
                        if (fSafe) {
                            // Authentication successful, transfer NFT!
                            cCollection.transfer(addrCaller, arrParams[2],
                                arrParams[3], tx);
                        } else {
                            console.warn('An attempt to transfer SCP-' +
                                          cCollection.version + ' containing' +
                                          ' a non-caller input was detected,' +
                                          ' ignoring request...');
                        }
                    } else {
                        console.warn('An attempt to transfer SCP-' +
                                      cCollection.version + ' NFT failed: ' +
                                      'missing or not valid params!');
                    }
                } else if (arrParams[1] === 'destroy') {
                    // SCP NFT DESTROY (Remove NFT from account, usable by owner and only in non-protected collections)
                    /*
                        param 2 = NFT ID (str)
                    */
                    const check3 = arrParams[2] && arrParams[2].length === 64;

                    if (check3) {
                        // Fetch the change output of the contract call TX, assume the change output is the caller.
                        const addrCaller = tx.vout[1]
                            .scriptPubKey.addresses[0];
                        if (isEmpty(addrCaller)) {
                            throw Error('Missing caller address!');
                        }
                        // Authentication: Ensure all inputs of the TX are from the caller
                        const fSafe = await isCallAuthorized(tx, addrCaller);
                        if (fSafe) {
                            // Authentication successful, destroy NFT!
                            cCollection.destroy(addrCaller, idContract,
                                arrParams[2], tx);
                        } else {
                            console.warn('An attempt to destroy SCP-' +
                                          cToken.version + ' NFT containing' +
                                          ' a non-issuer input was detected' +
                                          ', ignoring request...');
                        }
                    } else {
                        console.warn('An attempt to destroy SCP-' +
                                      cCollection.version + ' NFT failed: ' +
                                      'missing or not valid params!');
                    }
                }
            }
        }
    }

    // Finished processing
    return true;
}

// Util stuff (should probably be put into a src/util.js module, #soon)
function isNil(a) {
    if (a === undefined || a === null || !a) return true; return false;
}
function isEmpty(a) {
    if (isNil(a) || !a.length) return true; return false;
}

// CORE DAEMON
setInterval(async () => {
    // Only run the daemon loop when we're a full-node
    if (!isFullnode) return;
    // Every 2 seconds we check the chain for changes and sync our state with it.
    if (!isScanningBlocks) {
        try {
            // If we have no blocks cache, we need to start scanning the chain!
            if (nCacheScannedBlks === 0) {
                // Scan from the first known SCP-burn block
                const nCurrentBlock = await rpcMain.call('getblockcount');
                // Note: Rescans won't happen here, since we have no blocks anyway
                await getMsgsFromChain(nCurrentBlock - nFirstBlock);
            } else {
            // If we have a blocks cache, only try scanning the last ~20 blocks for changes.
            // Note: Rescans will definitely happen here, so make sure we skip them by signalling so.
                await getMsgsFromChain(20, true);
                // Save our Sync Assist file to use for fast-restart (or easy export) purposes
                await DB.createSyncAssistSnap();
            }
        } catch(e) {
            console.warn('CSP: Unable to scan blocks, retrying...');
            console.log(e);
            isScanningBlocks = false;
        }
    }
}, 5000);
