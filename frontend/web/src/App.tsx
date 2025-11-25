import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface SocialMiningData {
  id: string;
  name: string;
  encryptedValue: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface UserContribution {
  userId: string;
  name: string;
  encryptedScore: number;
  publicScore: number;
  rank: number;
  lastActive: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [miningData, setMiningData] = useState<SocialMiningData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingData, setCreatingData] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newMiningData, setNewMiningData] = useState({ name: "", value: "", description: "" });
  const [selectedData, setSelectedData] = useState<SocialMiningData | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [userContributions, setUserContributions] = useState<UserContribution[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalValue: 0, avgScore: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const dataList: SocialMiningData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          dataList.push({
            id: businessId,
            name: businessData.name,
            encryptedValue: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setMiningData(dataList);
      generateMockContributions();
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const generateMockContributions = () => {
    const contributions: UserContribution[] = [];
    const users = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry"];
    
    users.forEach((user, index) => {
      contributions.push({
        userId: `user-${index}`,
        name: user,
        encryptedScore: Math.floor(Math.random() * 1000) + 500,
        publicScore: Math.floor(Math.random() * 100) + 50,
        rank: index + 1,
        lastActive: Date.now() - Math.floor(Math.random() * 86400000)
      });
    });
    
    setUserContributions(contributions);
    setStats({
      totalUsers: contributions.length,
      totalValue: contributions.reduce((sum, user) => sum + user.encryptedScore, 0),
      avgScore: Math.round(contributions.reduce((sum, user) => sum + user.publicScore, 0) / contributions.length)
    });
  };

  const createMiningData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingData(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted social data..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const intValue = parseInt(newMiningData.value) || 0;
      const businessId = `social-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, intValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newMiningData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newMiningData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Social data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewMiningData({ name: "", value: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingData(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const handleDecryptClick = async (data: SocialMiningData) => {
    const decrypted = await decryptData(data.id);
    if (decrypted !== null) {
      setDecryptedValue(decrypted);
    }
  };

  const handleCheckAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available and ready!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStatsPanel = () => {
    return (
      <div className="stats-panels">
        <div className="stat-panel metal-gold">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Total Miners</div>
          </div>
        </div>
        
        <div className="stat-panel metal-silver">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalValue.toLocaleString()}</div>
            <div className="stat-label">Total Value</div>
          </div>
        </div>
        
        <div className="stat-panel metal-bronze">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgScore}</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
      </div>
    );
  };

  const renderContributionChart = () => {
    return (
      <div className="contribution-chart">
        <h3>User Contribution Ranking</h3>
        <div className="chart-bars">
          {userContributions.slice(0, 5).map((user, index) => (
            <div key={user.userId} className="chart-bar-container">
              <div className="bar-info">
                <span className="user-name">{user.name}</span>
                <span className="user-score">{user.encryptedScore} pts</span>
              </div>
              <div className="chart-bar">
                <div 
                  className="bar-fill" 
                  style={{ width: `${(user.encryptedScore / 1500) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>SocialMine_Z 🔐</h1>
            <span>Private Social Mining</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💎</div>
            <h2>Connect Wallet to Start Mining</h2>
            <p>Your social behavior is valuable. Mine it privately with FHE encryption.</p>
            <div className="mining-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Encrypt your social behavior data</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Earn tokens through homomorphic computation</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="mining-spinner"></div>
        <p>Initializing FHE Mining System...</p>
        <p className="loading-note">Securing your social data with homomorphic encryption</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="mining-spinner"></div>
      <p>Loading Social Mining Dashboard...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>SocialMine_Z 🔐</h1>
          <span>Encrypted Social Behavior Mining</span>
        </div>
        
        <div className="header-actions">
          <button onClick={handleCheckAvailability} className="check-btn">
            Check FHE Status
          </button>
          <button onClick={() => setShowCreateModal(true)} className="mine-btn">
            + Mine Social Data
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="dashboard-container">
        <div className="main-panel">
          <div className="panel-header">
            <h2>Social Mining Dashboard</h2>
            <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "🔄" : "Refresh"}
            </button>
          </div>
          
          {renderStatsPanel()}
          {renderContributionChart()}
          
          <div className="data-section">
            <h3>Encrypted Mining Records</h3>
            <div className="data-list">
              {miningData.length === 0 ? (
                <div className="no-data">
                  <p>No mining records found</p>
                  <button onClick={() => setShowCreateModal(true)} className="mine-btn">
                    Start Mining
                  </button>
                </div>
              ) : (
                miningData.map((data, index) => (
                  <div key={index} className="data-item metal-border">
                    <div className="data-main">
                      <div className="data-title">{data.name}</div>
                      <div className="data-meta">
                        <span>Score: {data.publicValue1}</span>
                        <span>{new Date(data.timestamp * 1000).toLocaleDateString()}</span>
                      </div>
                      <div className="data-desc">{data.description}</div>
                    </div>
                    <div className="data-actions">
                      <button 
                        onClick={() => handleDecryptClick(data)}
                        className={`decrypt-btn ${data.isVerified ? 'verified' : ''}`}
                        disabled={isDecrypting}
                      >
                        {data.isVerified ? '✅ Verified' : isDecrypting ? '🔓...' : '🔓 Decrypt'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="side-panel">
          <div className="user-ranking">
            <h3>Top Miners</h3>
            <div className="ranking-list">
              {userContributions.map((user, index) => (
                <div key={user.userId} className="rank-item">
                  <div className="rank-number">#{index + 1}</div>
                  <div className="rank-info">
                    <div className="rank-name">{user.name}</div>
                    <div className="rank-score">{user.encryptedScore} pts</div>
                  </div>
                  <div className="rank-badge">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '💎'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal metal-panel">
            <div className="modal-header">
              <h2>Mine Social Data</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="fhe-notice">
                <strong>FHE 🔐 Protection</strong>
                <p>Your social data will be encrypted using homomorphic encryption</p>
              </div>
              
              <div className="form-group">
                <label>Data Type</label>
                <input 
                  type="text" 
                  value={newMiningData.name}
                  onChange={(e) => setNewMiningData({...newMiningData, name: e.target.value})}
                  placeholder="e.g., Likes, Shares, Comments"
                />
              </div>
              
              <div className="form-group">
                <label>Value (Integer only)</label>
                <input 
                  type="number" 
                  value={newMiningData.value}
                  onChange={(e) => setNewMiningData({...newMiningData, value: e.target.value})}
                  placeholder="Enter numeric value"
                />
                <span className="input-hint">FHE Encrypted Integer</span>
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <input 
                  type="text" 
                  value={newMiningData.description}
                  onChange={(e) => setNewMiningData({...newMiningData, description: e.target.value})}
                  placeholder="Brief description"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createMiningData}
                disabled={creatingData || isEncrypting || !newMiningData.name || !newMiningData.value}
                className="submit-btn"
              >
                {creatingData || isEncrypting ? "Encrypting..." : "Mine Data"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="notification-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


