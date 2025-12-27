import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test_mongodb():
    try:
        client = AsyncIOMotorClient('mongodb://localhost:27017', serverSelectionTimeoutMS=5000)
        await client.admin.command('ping')
        print('✅ MongoDB 连接成功')
        
        # 检查数据库和集合
        db = client['writerai_sharedb']
        collections = await db.list_collection_names()
        print(f'✅ 数据库 writerai_sharedb 存在，集合: {collections}')
        
        # 检查 documents 集合中的文档
        if 'documents' in collections:
            count = await db.documents.count_documents({})
            print(f'✅ documents 集合中有 {count} 个文档')
            
            # 查找章节文档
            chapter_docs = await db.documents.find({"id": {"$regex": "work_.*_chapter_.*"}}).to_list(length=5)
            print(f'✅ 找到 {len(chapter_docs)} 个章节文档（前5个）:')
            for doc in chapter_docs:
                doc_id = doc.get('id', 'N/A')
                content_len = len(doc.get('content', ''))
                version = doc.get('version', 0)
                print(f'  - {doc_id}: 版本 {version}, 内容长度 {content_len}')
        else:
            print('⚠️ documents 集合不存在')
        
        client.close()
    except Exception as e:
        print(f'❌ MongoDB 连接失败: {e}')

if __name__ == '__main__':
    asyncio.run(test_mongodb())


