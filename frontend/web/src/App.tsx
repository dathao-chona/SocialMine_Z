import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface SocialMiningData {
  id: string;
  name: string;
  socialValue: number;
  activityScore: number;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  description: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [miningData, setMiningData] = useState<SocialMiningData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingMining, setCreatingMining] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newMiningData, setNewMiningData] = useState({ 
    name: "", 
    socialValue: "", 
    activity: "",
    description: ""
  });
  const [selectedMining, setSelectedMining] = useState<SocialMiningData | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
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
      const miningList: SocialMiningData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          miningList.push({
            id: businessId,
            name: businessData.name,
            socialValue: 0,
            activityScore: Number(businessData.publicValue1) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            description: businessData.description
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setMiningData(miningList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createMiningData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingMining(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating social mining data with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const socialValue = parseInt(newMiningData.socialValue) || 0;
      const businessId = `mining-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, socialValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newMiningData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newMiningData.activity) || 0,
        0,
        newMiningData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Social mining data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewMiningData({ name: "", socialValue: "", activity: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingMining(false); 
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
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
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

  const filteredMiningData = miningData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterVerified || item.isVerified;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: miningData.length,
    verified: miningData.filter(m => m.isVerified).length,
    totalValue: miningData.reduce((sum, m) => sum + (m.decryptedValue || 0), 0),
    avgActivity: miningData.length > 0 ? miningData.reduce((sum, m) => sum + m.activityScore, 0) / miningData.length : 0
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>SocialMine_Z 🌟</h1>
            <p>社交隱私挖礦 · FHE Protected</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Wallet to Start Private Social Mining</h2>
            <p>Encrypt your social behavior data with FHE and earn rewards without compromising privacy</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Encrypt social behavior data</p>
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
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your social data with homomorphic encryption</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading Social Mining Platform...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>SocialMine_Z 🌟</h1>
          <p>社交隱私挖礦 · FHE Protected</p>
        </div>
        
        <div className="header-actions">
          <button onClick={handleCheckAvailability} className="availability-btn">
            Check Availability
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + Add Social Data
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <h3>Total Mining Data</h3>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <h3>Verified Data</h3>
            <div className="stat-value">{stats.verified}</div>
          </div>
          <div className="stat-card">
            <h3>Total Value</h3>
            <div className="stat-value">{stats.totalValue}</div>
          </div>
          <div className="stat-card">
            <h3>Avg Activity</h3>
            <div className="stat-value">{stats.avgActivity.toFixed(1)}</div>
          </div>
        </div>

        <div className="controls-panel">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search mining data..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filters">
            <label>
              <input 
                type="checkbox" 
                checked={filterVerified}
                onChange={(e) => setFilterVerified(e.target.checked)}
              />
              Show Verified Only
            </label>
            <button onClick={loadData} disabled={isRefreshing} className="refresh-btn">
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mining-data-list">
          {filteredMiningData.length === 0 ? (
            <div className="no-data">
              <p>No social mining data found</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Add First Data Point
              </button>
            </div>
          ) : (
            filteredMiningData.map((item, index) => (
              <div 
                key={index} 
                className={`mining-item ${item.isVerified ? 'verified' : ''} ${selectedMining?.id === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedMining(item)}
              >
                <div className="item-header">
                  <h3>{item.name}</h3>
                  <span className={`status ${item.isVerified ? 'verified' : 'pending'}`}>
                    {item.isVerified ? '✅ Verified' : '🔓 Pending'}
                  </span>
                </div>
                <p className="description">{item.description}</p>
                <div className="item-meta">
                  <span>Activity: {item.activityScore}/10</span>
                  <span>{new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                {item.isVerified && item.decryptedValue && (
                  <div className="decrypted-value">
                    Social Value: {item.decryptedValue}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateMiningModal 
          onSubmit={createMiningData}
          onClose={() => setShowCreateModal(false)}
          creating={creatingMining}
          miningData={newMiningData}
          setMiningData={setNewMiningData}
          isEncrypting={isEncrypting}
        />
      )}

      {selectedMining && (
        <MiningDetailModal 
          mining={selectedMining}
          onClose={() => {
            setSelectedMining(null);
            setDecryptedValue(null);
          }}
          decryptedValue={decryptedValue}
          isDecrypting={isDecrypting || fheIsDecrypting}
          decryptData={() => decryptData(selectedMining.id)}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateMiningModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  miningData: any;
  setMiningData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, miningData, setMiningData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'socialValue') {
      const intValue = value.replace(/[^\d]/g, '');
      setMiningData({ ...miningData, [name]: intValue });
    } else {
      setMiningData({ ...miningData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Social Mining Data</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Protection</strong>
            <p>Social value will be encrypted using homomorphic encryption</p>
          </div>
          
          <div className="form-group">
            <label>Data Name *</label>
            <input 
              type="text" 
              name="name" 
              value={miningData.name} 
              onChange={handleChange} 
              placeholder="Enter data name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Social Value (Integer) *</label>
            <input 
              type="number" 
              name="socialValue" 
              value={miningData.socialValue} 
              onChange={handleChange} 
              placeholder="Enter social value..." 
              min="0"
            />
            <div className="data-type-label">FHE Encrypted</div>
          </div>
          
          <div className="form-group">
            <label>Activity Score (1-10) *</label>
            <input 
              type="number" 
              name="activity" 
              value={miningData.activity} 
              onChange={handleChange} 
              placeholder="1-10" 
              min="1" 
              max="10"
            />
            <div className="data-type-label">Public Data</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={miningData.description} 
              onChange={handleChange} 
              placeholder="Describe this social data point..." 
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !miningData.name || !miningData.socialValue || !miningData.activity}
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Data"}
          </button>
        </div>
      </div>
    </div>
  );
};

const MiningDetailModal: React.FC<{
  mining: SocialMiningData;
  onClose: () => void;
  decryptedValue: number | null;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ mining, onClose, decryptedValue, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) return;
    await decryptData();
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Mining Data Details</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="mining-info">
            <div className="info-row">
              <span>Name:</span>
              <strong>{mining.name}</strong>
            </div>
            <div className="info-row">
              <span>Creator:</span>
              <strong>{mining.creator.substring(0, 8)}...{mining.creator.substring(36)}</strong>
            </div>
            <div className="info-row">
              <span>Created:</span>
              <strong>{new Date(mining.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-row">
              <span>Activity Score:</span>
              <strong>{mining.activityScore}/10</strong>
            </div>
            <div className="info-row">
              <span>Description:</span>
              <p>{mining.description}</p>
            </div>
          </div>
          
          <div className="encryption-section">
            <h3>FHE Encryption Status</h3>
            <div className="encryption-status">
              <div className="status-item">
                <span>Social Value:</span>
                <div className="value-display">
                  {mining.isVerified ? 
                    `${mining.decryptedValue} (On-chain Verified)` : 
                    decryptedValue !== null ? 
                    `${decryptedValue} (Locally Decrypted)` : 
                    "🔒 Encrypted"
                  }
                </div>
              </div>
              
              <button 
                className={`decrypt-btn ${(mining.isVerified || decryptedValue !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt}
                disabled={isDecrypting || mining.isVerified}
              >
                {isDecrypting ? "Decrypting..." : 
                 mining.isVerified ? "✅ Verified" : 
                 decryptedValue !== null ? "🔄 Re-verify" : 
                 "🔓 Verify Decryption"}
              </button>
            </div>
            
            <div className="fhe-explanation">
              <p><strong>FHE Process:</strong> Data encrypted on-chain → Offline decryption → On-chain verification</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;