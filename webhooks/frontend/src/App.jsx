import { useState, useEffect } from 'react'

// Backend API URL - change this for production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function App() {
    const [events, setEvents] = useState([])
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)
    const [displayCount, setDisplayCount] = useState(10)

    // Fetch events and stats from backend
    const fetchData = async () => {
        try {
            const [eventsRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/events?limit=100`), // Fetch more events
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

    // Load more transactions
    const loadMore = () => {
        setDisplayCount(prev => Math.min(prev + 10, events.length))
    }

    // Show fewer transactions
    const showLess = () => {
        setDisplayCount(10)
    }

    // Get displayed events
    const displayedEvents = events.slice(0, displayCount)
    const hasMore = displayCount < events.length

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
                        {lastUpdated && (
                            <span className="last-updated">
                                Updated: {formatTime(lastUpdated)}
                            </span>
                        )}
                        <span className={`status-badge ${error ? 'error' : 'live'}`}>
                            {error ? '● Offline' : '● Live'}
                        </span>
                    </div>
                </div>
            </header>

            <main className="main">
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
                    <div className="section-header">
                        <h2 className="section-title">Recent Transactions</h2>
                        <span className="transaction-count">
                            Showing {displayedEvents.length} of {events.length}
                        </span>
                    </div>

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
                        <>
                            <div className="events-table-wrapper scrollable">
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
                                        {displayedEvents.map((event) => (
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

                            {/* Load More / Show Less Buttons */}
                            <div className="pagination-controls">
                                {hasMore && (
                                    <button onClick={loadMore} className="load-more-btn">
                                        Load More ({events.length - displayCount} remaining)
                                    </button>
                                )}
                                {displayCount > 10 && (
                                    <button onClick={showLess} className="show-less-btn">
                                        Show Less
                                    </button>
                                )}
                            </div>
                        </>
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
