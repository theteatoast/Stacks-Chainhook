import { useState, useEffect } from 'react'
import { AppConfig, showConnect, UserSession } from '@stacks/connect'
import { StacksMainnet } from '@stacks/network'
import {
    callReadOnlyFunction,
    makeContractCall,
    broadcastTransaction,
    stringAsciiCV,
    uintCV,
    principalCV,
    cvToString
} from '@stacks/transactions'

// Backend API URL - change this for production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Contract configuration - YOUR DEPLOYED CONTRACT
const CONTRACT_ADDRESS = 'SP7EGRZWRGBDHWDMJAYER4D40JM8XZCEX14M4ATQ'
const CONTRACT_NAME = 'theteatoast'
const NETWORK = new StacksMainnet()

// Stacks Connect config
const appConfig = new AppConfig(['store_write', 'publish_data'])
const userSession = new UserSession({ appConfig })

function App() {
    const [events, setEvents] = useState([])
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    // Wallet state
    const [userData, setUserData] = useState(null)
    const [txStatus, setTxStatus] = useState(null)

    // Contract interaction state
    const [username, setUsername] = useState('')
    const [lookupResult, setLookupResult] = useState(null)

    // Check if user is already logged in
    useEffect(() => {
        if (userSession.isUserSignedIn()) {
            setUserData(userSession.loadUserData())
        }
    }, [])

    // Connect wallet
    const connectWallet = () => {
        showConnect({
            appDetails: {
                name: 'Stacks Chainhook Monitor',
                icon: window.location.origin + '/vite.svg',
            },
            redirectTo: '/',
            onFinish: () => {
                setUserData(userSession.loadUserData())
            },
            userSession,
        })
    }

    // Disconnect wallet
    const disconnectWallet = () => {
        userSession.signUserOut()
        setUserData(null)
    }

    // Get user's STX address
    const getAddress = () => {
        if (!userData) return null
        return userData.profile?.stxAddress?.mainnet
    }

    // Lookup username (read-only call)
    const lookupUsername = async () => {
        if (!username.trim()) return

        setLookupResult({ loading: true })

        try {
            const result = await callReadOnlyFunction({
                contractAddress: CONTRACT_ADDRESS,
                contractName: CONTRACT_NAME,
                functionName: 'get-owner',
                functionArgs: [stringAsciiCV(username)],
                network: NETWORK,
                senderAddress: getAddress() || CONTRACT_ADDRESS,
            })

            setLookupResult({
                username,
                result: cvToString(result),
                success: true
            })
        } catch (err) {
            setLookupResult({
                username,
                error: err.message,
                success: false
            })
        }
    }

    // Register username (write call)
    const registerUsername = async () => {
        if (!username.trim() || !userData) {
            alert('Please connect wallet and enter a username')
            return
        }

        setTxStatus({ status: 'pending', message: 'Preparing transaction...' })

        try {
            const txOptions = {
                contractAddress: CONTRACT_ADDRESS,
                contractName: CONTRACT_NAME,
                functionName: 'register',
                functionArgs: [stringAsciiCV(username)],
                network: NETWORK,
                appDetails: {
                    name: 'Stacks Chainhook Monitor',
                    icon: window.location.origin + '/vite.svg',
                },
                onFinish: (data) => {
                    setTxStatus({
                        status: 'success',
                        message: 'Transaction submitted!',
                        txId: data.txId
                    })
                },
                onCancel: () => {
                    setTxStatus({
                        status: 'cancelled',
                        message: 'Transaction cancelled by user'
                    })
                }
            }

            await makeContractCall(txOptions)
        } catch (err) {
            setTxStatus({
                status: 'error',
                message: err.message
            })
        }
    }

    // Release username (write call)
    const releaseUsername = async () => {
        if (!username.trim() || !userData) {
            alert('Please connect wallet and enter a username')
            return
        }

        setTxStatus({ status: 'pending', message: 'Preparing transaction...' })

        try {
            const txOptions = {
                contractAddress: CONTRACT_ADDRESS,
                contractName: CONTRACT_NAME,
                functionName: 'release',
                functionArgs: [stringAsciiCV(username)],
                network: NETWORK,
                appDetails: {
                    name: 'Stacks Chainhook Monitor',
                    icon: window.location.origin + '/vite.svg',
                },
                onFinish: (data) => {
                    setTxStatus({
                        status: 'success',
                        message: 'Transaction submitted!',
                        txId: data.txId
                    })
                },
                onCancel: () => {
                    setTxStatus({
                        status: 'cancelled',
                        message: 'Transaction cancelled by user'
                    })
                }
            }

            await makeContractCall(txOptions)
        } catch (err) {
            setTxStatus({
                status: 'error',
                message: err.message
            })
        }
    }

    // Fetch events and stats from backend
    const fetchData = async () => {
        try {
            const [eventsRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/events?limit=20`),
                fetch(`${API_URL}/stats`)
            ])

            if (!eventsRes.ok || !statsRes.ok) {
                throw new Error('Failed to fetch data from server')
            }

            const eventsData = await eventsRes.json()
            const statsData = await statsRes.json()

            setEvents(eventsData.events || [])
            setStats(statsData.stats || null)
            setError(null)
            setLastUpdated(new Date())
        } catch (err) {
            console.error('Error fetching data:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Initial fetch and polling every 5 seconds
    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 5000)
        return () => clearInterval(interval)
    }, [])

    // Format timestamp for display
    const formatTime = (timestamp) => {
        if (!timestamp) return 'N/A'
        return new Date(timestamp).toLocaleString()
    }

    // Truncate long strings
    const truncate = (str, length = 16) => {
        if (!str || str.length <= length) return str
        return `${str.slice(0, length)}...`
    }

    // Format txid with link to explorer
    const TxLink = ({ txid }) => {
        if (!txid || txid === 'unknown') return <span className="tx-unknown">Unknown</span>
        const explorerUrl = `https://explorer.stacks.co/txid/${txid}?chain=mainnet`
        return (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="tx-link">
                {truncate(txid, 12)}
            </a>
        )
    }

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    <h1 className="logo">
                        <span className="logo-icon">⚡</span>
                        Stacks Chainhook Monitor
                    </h1>
                    <div className="header-info">
                        {userData ? (
                            <div className="wallet-info">
                                <span className="wallet-address">{truncate(getAddress(), 12)}</span>
                                <button onClick={disconnectWallet} className="disconnect-btn">
                                    Disconnect
                                </button>
                            </div>
                        ) : (
                            <button onClick={connectWallet} className="connect-btn">
                                Connect Wallet
                            </button>
                        )}
                        <span className={`status-badge ${error ? 'error' : 'live'}`}>
                            {error ? '● Offline' : '● Live'}
                        </span>
                    </div>
                </div>
            </header>

            <main className="main">
                {/* Contract Interaction Section */}
                <section className="contract-section">
                    <h2 className="section-title">Contract Interaction</h2>
                    <div className="contract-card">
                        <div className="contract-info">
                            <span className="contract-label">Contract:</span>
                            <code>{CONTRACT_ADDRESS}.{CONTRACT_NAME}</code>
                        </div>

                        <div className="contract-form">
                            <input
                                type="text"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="username-input"
                            />

                            <div className="button-group">
                                <button onClick={lookupUsername} className="action-btn lookup">
                                    🔍 Lookup Owner
                                </button>
                                <button
                                    onClick={registerUsername}
                                    className="action-btn register"
                                    disabled={!userData}
                                >
                                    📝 Register
                                </button>
                                <button
                                    onClick={releaseUsername}
                                    className="action-btn release"
                                    disabled={!userData}
                                >
                                    🔓 Release
                                </button>
                            </div>
                        </div>

                        {/* Lookup Result */}
                        {lookupResult && (
                            <div className={`result-box ${lookupResult.success ? 'success' : 'error'}`}>
                                {lookupResult.loading ? (
                                    <span>Looking up...</span>
                                ) : lookupResult.success ? (
                                    <span>
                                        <strong>{lookupResult.username}</strong> → {lookupResult.result}
                                    </span>
                                ) : (
                                    <span>Error: {lookupResult.error}</span>
                                )}
                            </div>
                        )}

                        {/* Transaction Status */}
                        {txStatus && (
                            <div className={`tx-status ${txStatus.status}`}>
                                <span>{txStatus.message}</span>
                                {txStatus.txId && (
                                    <a
                                        href={`https://explorer.stacks.co/txid/${txStatus.txId}?chain=mainnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View on Explorer →
                                    </a>
                                )}
                            </div>
                        )}

                        {!userData && (
                            <p className="connect-hint">Connect your wallet to register or release usernames</p>
                        )}
                    </div>
                </section>

                {/* Error Message */}
                {error && (
                    <div className="error-banner">
                        <span className="error-icon">⚠️</span>
                        <span>Connection error: {error}</span>
                        <button onClick={fetchData} className="retry-btn">Retry</button>
                    </div>
                )}

                {/* Stats Cards */}
                <section className="stats-section">
                    <h2 className="section-title">Contract Statistics</h2>
                    <div className="stats-grid">
                        <div className="stat-card primary">
                            <div className="stat-value">
                                {loading ? '...' : (stats?.totalInteractions || 0)}
                            </div>
                            <div className="stat-label">Total Interactions</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {loading ? '...' : (stats?.uniqueSenders || 0)}
                            </div>
                            <div className="stat-label">Unique Wallets</div>
                        </div>
                        <div className="stat-card success">
                            <div className="stat-value">
                                {loading ? '...' : (stats?.successfulTransactions || 0)}
                            </div>
                            <div className="stat-label">Successful TXs</div>
                        </div>
                        <div className="stat-card danger">
                            <div className="stat-value">
                                {loading ? '...' : (stats?.failedTransactions || 0)}
                            </div>
                            <div className="stat-label">Failed TXs</div>
                        </div>
                    </div>
                </section>

                {/* Recent Transactions */}
                <section className="events-section">
                    <h2 className="section-title">Recent Transactions</h2>

                    {loading ? (
                        <div className="loading">
                            <div className="spinner"></div>
                            <span>Loading events...</span>
                        </div>
                    ) : events.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📭</div>
                            <h3>No transactions yet</h3>
                            <p>Waiting for contract interactions on Stacks mainnet...</p>
                        </div>
                    ) : (
                        <div className="events-table-wrapper">
                            <table className="events-table">
                                <thead>
                                    <tr>
                                        <th>Transaction ID</th>
                                        <th>Sender</th>
                                        <th>Method</th>
                                        <th>Block</th>
                                        <th>Status</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((event) => (
                                        <tr key={event.id}>
                                            <td>
                                                <TxLink txid={event.txid} />
                                            </td>
                                            <td className="sender">
                                                <code>{truncate(event.sender, 20)}</code>
                                            </td>
                                            <td>
                                                <span className="method-badge">{event.method || 'unknown'}</span>
                                            </td>
                                            <td className="block-height">
                                                {event.blockHeight || 'N/A'}
                                            </td>
                                            <td>
                                                <span className={`status-pill ${event.success ? 'success' : 'failed'}`}>
                                                    {event.success ? 'Success' : 'Failed'}
                                                </span>
                                            </td>
                                            <td className="timestamp">
                                                {formatTime(event.timestamp)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>

            {/* Footer */}
            <footer className="footer">
                <p>
                    Powered by{' '}
                    <a href="https://www.hiro.so/" target="_blank" rel="noopener noreferrer">
                        Hiro Chainhooks
                    </a>
                    {' '}• Built for{' '}
                    <a href="https://stacks.co/" target="_blank" rel="noopener noreferrer">
                        Stacks
                    </a>
                </p>
            </footer>
        </div>
    )
}

export default App
