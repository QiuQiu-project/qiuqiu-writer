import React, { useState } from 'react';
import { Card, Button, message, Typography, Alert, Row, Col } from 'antd';
import { ClearOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Paragraph } = Typography;

const Maintenance: React.FC = () => {
  const [loadingCache, setLoadingCache] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  const handleClearCache = async () => {
    setLoadingCache(true);
    try {
      const token = localStorage.getItem('admin_token');
      await axios.post('/api/v1/admin/maintenance/clear-cache', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      message.success('System cache cleared successfully');
    } catch (error) {
      message.error('Failed to clear cache');
    } finally {
      setLoadingCache(false);
    }
  };

  const handleReloadConfig = async () => {
    setLoadingConfig(true);
    try {
      const token = localStorage.getItem('admin_token');
      await axios.post('/api/v1/admin/maintenance/reload-config', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      message.success('Configuration reloaded successfully');
    } catch (error) {
      message.error('Failed to reload configuration');
    } finally {
      setLoadingConfig(false);
    }
  };

  return (
    <div>
      <Title level={2}>System Maintenance</Title>
      <Paragraph>
        Perform administrative tasks to maintain system health and configuration.
      </Paragraph>

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="Cache Management" variant="borderless">
            <Alert
              message="Clearing cache may temporarily impact system performance."
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Paragraph>
              Clear Redis cache and other temporary data. Useful when data inconsistencies occur or after major updates.
            </Paragraph>
            <Button
              type="primary"
              danger
              icon={<ClearOutlined />}
              loading={loadingCache}
              onClick={handleClearCache}
            >
              Clear System Cache
            </Button>
          </Card>
        </Col>
        
        <Col span={12}>
          <Card title="Configuration" variant="borderless">
            <Alert
              message="Reloads settings from .env and Nacos (if enabled)."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Paragraph>
              Reload system configuration without restarting the server. Useful for applying hot-fixes or configuration changes.
            </Paragraph>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={loadingConfig}
              onClick={handleReloadConfig}
            >
              Reload Configuration
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Maintenance;
