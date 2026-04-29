-- ATH-20 RLS tests (run in isolated database)
begin;

truncate table bi_access_grants, org_members, document_embeddings, departments restart identity cascade;

select set_config('app.org_id', '00000000-0000-0000-0000-000000000001', true);
select set_config('app.user_id', 'admin-org1', true);

insert into departments(id, org_id, name, slug) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Sales','sales'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','HR','hr'),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Eng','eng');

insert into org_members(org_id,user_id,email,role,dept_id) values
('00000000-0000-0000-0000-000000000001','admin-org1','a@x.com','admin','10000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','member-sales','m1@x.com','member','10000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','analyst-eng','m2@x.com','bi_analyst','10000000-0000-0000-0000-000000000003');

insert into bi_access_grants(org_id,user_id,dept_id,created_by) values
('00000000-0000-0000-0000-000000000001','analyst-eng','10000000-0000-0000-0000-000000000002','admin-org1');

insert into document_embeddings(org_id,document_id,chunk_id,chunk_index,embedding,dept_id,visibility,source_type)
values
('00000000-0000-0000-0000-000000000001','doc-sales','chunk-sales',0,array_fill(0.1::float4, ARRAY[1536])::vector,'10000000-0000-0000-0000-000000000001','department','slack'),
('00000000-0000-0000-0000-000000000001','doc-hr-bi','chunk-hr-bi',0,array_fill(0.1::float4, ARRAY[1536])::vector,'10000000-0000-0000-0000-000000000002','bi_accessible','jira'),
('00000000-0000-0000-0000-000000000001','doc-hr-conf','chunk-hr-conf',0,array_fill(0.1::float4, ARRAY[1536])::vector,'10000000-0000-0000-0000-000000000002','confidential','jira');

-- admin: sees all 3
select set_config('app.user_id', 'admin-org1', true);
select count(*) as admin_count from document_embeddings;

-- member-sales: sees sales only
select set_config('app.user_id', 'member-sales', true);
select count(*) as member_count from document_embeddings;

-- analyst-eng: sees bi grant + own dept (no confidential)
select set_config('app.user_id', 'analyst-eng', true);
select count(*) as analyst_count from document_embeddings;

rollback;
