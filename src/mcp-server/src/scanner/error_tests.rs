#[cfg(test)]
mod tests {
    use super::super::{ScanError, ScannerScanResult};
    use std::time::Duration;
    
    #[test]
    fn test_error_display() {
        let err = ScanError::Timeout(Duration::from_secs(30));
        assert!(err.to_string().contains("Timeout error"));
        assert!(err.to_string().contains("30s"));
    }
    
    #[test]
    fn test_error_config() {
        let err = ScanError::Config("Invalid URL".to_string());
        assert!(err.to_string().contains("Configuration error"));
        assert!(err.to_string().contains("Invalid URL"));
    }
    
    #[test]
    fn test_error_remote() {
        let err = ScanError::Remote {
            code: "500".to_string(),
            message: "Internal server error".to_string(),
        };
        assert!(err.to_string().contains("Remote server error"));
        assert!(err.to_string().contains("500"));
        assert!(err.to_string().contains("Internal server error"));
    }
    
    #[test]
    fn test_error_execution() {
        let err = ScanError::Execution("Scan failed".to_string());
        assert!(err.to_string().contains("Scan execution error"));
        assert!(err.to_string().contains("Scan failed"));
    }
}
