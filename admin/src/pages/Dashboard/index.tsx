import React from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import { UserOutlined, BookOutlined, ReadOutlined } from '@ant-design/icons';

const Dashboard: React.FC = () => {
  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Dashboard</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Users"
              value={1128}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Works"
              value={93}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Chapters"
              value={2345}
              prefix={<ReadOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>
      
      <Card title="Recent Activity" style={{ marginTop: 24 }}>
        <p>User "pang" logged in.</p>
        <p>New work "My Novel" created.</p>
        <p>System update completed.</p>
      </Card>
    </div>
  );
};

export default Dashboard;
