--
-- PostgreSQL database dump
--

\restrict RSLOfVme8dhZXkLL1GMu3bnqQD1Ll0ux6bK0iKVS1EJu80Umw798SVKcR8MZQLl

-- Dumped from database version 14.20 (Homebrew)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: booking_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_orders (
    id bigint NOT NULL,
    branch_id bigint NOT NULL,
    customer_name character varying(255),
    customer_phone character varying(50),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by character varying(255)
);

ALTER TABLE ONLY public.booking_orders FORCE ROW LEVEL SECURITY;


ALTER TABLE public.booking_orders OWNER TO postgres;

--
-- Name: booking_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.booking_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.booking_orders_id_seq OWNER TO postgres;

--
-- Name: booking_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.booking_orders_id_seq OWNED BY public.booking_orders.id;


--
-- Name: daily_branch_revenue; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.daily_branch_revenue (
    id bigint NOT NULL,
    restaurant_id bigint,
    date date NOT NULL,
    total_revenue numeric(10,2) DEFAULT 0 NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    average_check numeric(10,2),
    discount_amount numeric(10,2) DEFAULT 0,
    tax_amount numeric(10,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.daily_branch_revenue OWNER TO leonkul;

--
-- Name: daily_branch_revenue_id_seq; Type: SEQUENCE; Schema: public; Owner: leonkul
--

CREATE SEQUENCE public.daily_branch_revenue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.daily_branch_revenue_id_seq OWNER TO leonkul;

--
-- Name: daily_branch_revenue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: leonkul
--

ALTER SEQUENCE public.daily_branch_revenue_id_seq OWNED BY public.daily_branch_revenue.id;


--
-- Name: employee_utilization; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.employee_utilization (
    id bigint NOT NULL,
    employee_id bigint NOT NULL,
    restaurant_id bigint,
    date date NOT NULL,
    shift_hours numeric(10,2) DEFAULT 0 NOT NULL,
    worked_hours numeric(10,2) DEFAULT 0 NOT NULL,
    revenue_per_hour numeric(10,2),
    order_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.employee_utilization OWNER TO leonkul;

--
-- Name: employee_utilization_id_seq; Type: SEQUENCE; Schema: public; Owner: leonkul
--

CREATE SEQUENCE public.employee_utilization_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.employee_utilization_id_seq OWNER TO leonkul;

--
-- Name: employee_utilization_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: leonkul
--

ALTER SEQUENCE public.employee_utilization_id_seq OWNED BY public.employee_utilization.id;


--
-- Name: flyway_schema_history; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.flyway_schema_history (
    installed_rank integer NOT NULL,
    version character varying(50),
    description character varying(200) NOT NULL,
    type character varying(20) NOT NULL,
    script character varying(1000) NOT NULL,
    checksum integer,
    installed_by character varying(100) NOT NULL,
    installed_on timestamp without time zone DEFAULT now() NOT NULL,
    execution_time integer NOT NULL,
    success boolean NOT NULL
);


ALTER TABLE public.flyway_schema_history OWNER TO leonkul;

--
-- Name: loyalty_campaign_segments; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.loyalty_campaign_segments (
    campaign_id bigint NOT NULL,
    segment_id bigint NOT NULL
);


ALTER TABLE public.loyalty_campaign_segments OWNER TO leonkul;

--
-- Name: pricing_rule_impact; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.pricing_rule_impact (
    id bigint NOT NULL,
    tariff_rule_id bigint,
    restaurant_id bigint,
    date date NOT NULL,
    trigger_count integer DEFAULT 0 NOT NULL,
    total_impact numeric(10,2) DEFAULT 0 NOT NULL,
    average_impact numeric(10,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pricing_rule_impact OWNER TO leonkul;

--
-- Name: pricing_rule_impact_id_seq; Type: SEQUENCE; Schema: public; Owner: leonkul
--

CREATE SEQUENCE public.pricing_rule_impact_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.pricing_rule_impact_id_seq OWNER TO leonkul;

--
-- Name: pricing_rule_impact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: leonkul
--

ALTER SEQUENCE public.pricing_rule_impact_id_seq OWNED BY public.pricing_rule_impact.id;


--
-- Name: service_performance; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.service_performance (
    id bigint NOT NULL,
    restaurant_id bigint,
    dish_id bigint,
    date date NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    total_revenue numeric(10,2) DEFAULT 0 NOT NULL,
    average_price numeric(10,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.service_performance OWNER TO leonkul;

--
-- Name: service_performance_id_seq; Type: SEQUENCE; Schema: public; Owner: leonkul
--

CREATE SEQUENCE public.service_performance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.service_performance_id_seq OWNER TO leonkul;

--
-- Name: service_performance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: leonkul
--

ALTER SEQUENCE public.service_performance_id_seq OWNED BY public.service_performance.id;


--
-- Name: stop_check_analytics; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.stop_check_analytics (
    id bigint NOT NULL,
    tariff_rule_id bigint,
    restaurant_id bigint,
    date date NOT NULL,
    trigger_count integer DEFAULT 0 NOT NULL,
    stop_reason text,
    estimated_loss numeric(10,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.stop_check_analytics OWNER TO leonkul;

--
-- Name: stop_check_analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: leonkul
--

CREATE SEQUENCE public.stop_check_analytics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.stop_check_analytics_id_seq OWNER TO leonkul;

--
-- Name: stop_check_analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: leonkul
--

ALTER SEQUENCE public.stop_check_analytics_id_seq OWNED BY public.stop_check_analytics.id;


--
-- Name: tariff_calendars; Type: TABLE; Schema: public; Owner: leonkul
--

CREATE TABLE public.tariff_calendars (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    restaurant_id bigint,
    weekend_days text,
    fixed_holidays text,
    floating_holidays text,
    short_days text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tariff_calendars OWNER TO leonkul;

--
-- Name: tariff_calendars_id_seq; Type: SEQUENCE; Schema: public; Owner: leonkul
--

CREATE SEQUENCE public.tariff_calendars_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tariff_calendars_id_seq OWNER TO leonkul;

--
-- Name: tariff_calendars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: leonkul
--

ALTER SEQUENCE public.tariff_calendars_id_seq OWNED BY public.tariff_calendars.id;


--
-- Name: booking_orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_orders ALTER COLUMN id SET DEFAULT nextval('public.booking_orders_id_seq'::regclass);


--
-- Name: daily_branch_revenue id; Type: DEFAULT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.daily_branch_revenue ALTER COLUMN id SET DEFAULT nextval('public.daily_branch_revenue_id_seq'::regclass);


--
-- Name: employee_utilization id; Type: DEFAULT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.employee_utilization ALTER COLUMN id SET DEFAULT nextval('public.employee_utilization_id_seq'::regclass);


--
-- Name: pricing_rule_impact id; Type: DEFAULT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.pricing_rule_impact ALTER COLUMN id SET DEFAULT nextval('public.pricing_rule_impact_id_seq'::regclass);


--
-- Name: service_performance id; Type: DEFAULT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.service_performance ALTER COLUMN id SET DEFAULT nextval('public.service_performance_id_seq'::regclass);


--
-- Name: stop_check_analytics id; Type: DEFAULT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.stop_check_analytics ALTER COLUMN id SET DEFAULT nextval('public.stop_check_analytics_id_seq'::regclass);


--
-- Name: tariff_calendars id; Type: DEFAULT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.tariff_calendars ALTER COLUMN id SET DEFAULT nextval('public.tariff_calendars_id_seq'::regclass);


--
-- Data for Name: booking_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.booking_orders (id, branch_id, customer_name, customer_phone, created_at, created_by) FROM stdin;
\.


--
-- Data for Name: daily_branch_revenue; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.daily_branch_revenue (id, restaurant_id, date, total_revenue, order_count, average_check, discount_amount, tax_amount, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: employee_utilization; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.employee_utilization (id, employee_id, restaurant_id, date, shift_hours, worked_hours, revenue_per_hour, order_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: flyway_schema_history; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success) FROM stdin;
1	1	Create ingredients table	SQL	V1__Create_ingredients_table.sql	618053623	leonkul	2026-03-08 21:18:00.88798	10	t
2	2	Create dishes table	SQL	V2__Create_dishes_table.sql	1916527762	leonkul	2026-03-08 21:18:00.923574	5	t
3	3	Create dish ingredients table	SQL	V3__Create_dish_ingredients_table.sql	-2076262822	leonkul	2026-03-08 21:18:00.933517	8	t
4	4	Create stock movements table	SQL	V4__Create_stock_movements_table.sql	-584075305	leonkul	2026-03-08 21:18:00.94636	9	t
5	5	Create orders table	SQL	V5__Create_orders_table.sql	-1117222857	leonkul	2026-03-08 21:18:00.959615	4	t
6	6	Create order items table	SQL	V6__Create_order_items_table.sql	644238890	leonkul	2026-03-08 21:18:00.966718	3	t
7	7	Add foreign key stock movements orders	SQL	V7__Add_foreign_key_stock_movements_orders.sql	-1787403179	leonkul	2026-03-08 21:18:00.972737	2	t
8	8	Create activity log table	SQL	V8__Create_activity_log_table.sql	-206581232	leonkul	2026-03-08 21:18:00.979304	6	t
9	9	Create restaurants table	SQL	V9__Create_restaurants_table.sql	602260839	leonkul	2026-03-08 21:18:00.988424	2	t
10	10	Create users table	SQL	V10__Create_users_table.sql	376892612	leonkul	2026-03-08 21:18:00.993572	6	t
11	11	Create refresh tokens table	SQL	V11__Create_refresh_tokens_table.sql	-475538933	leonkul	2026-03-08 21:18:01.002771	5	t
12	12	Add restaurant id to existing tables	SQL	V12__Add_restaurant_id_to_existing_tables.sql	-506418194	leonkul	2026-03-08 21:18:01.010983	6	t
13	13	Create test data	SQL	V13__Create_test_data.sql	270979574	leonkul	2026-03-08 21:18:01.020192	2	t
14	14	Rename email to username	SQL	V14__Rename_email_to_username.sql	1607723952	leonkul	2026-03-08 21:18:01.026557	3	t
15	15	Create head admin	SQL	V15__Create_head_admin.sql	-343857354	leonkul	2026-03-08 21:18:01.033583	1	t
16	16	Fix password hashes	SQL	V16__Fix_password_hashes.sql	-1825190721	leonkul	2026-03-08 21:18:01.036553	0	t
17	17	Create verification codes table	SQL	V17__Create_verification_codes_table.sql	-1296528250	leonkul	2026-03-08 21:18:01.039026	4	t
18	18	Improve verification codes security	SQL	V18__Improve_verification_codes_security.sql	-219391274	leonkul	2026-03-08 21:18:01.046085	4	t
19	19	Add version to ingredients	SQL	V19__Add_version_to_ingredients.sql	577801119	leonkul	2026-03-08 21:18:01.053709	1	t
20	20	Fix dishes unique index for soft delete	SQL	V20__Fix_dishes_unique_index_for_soft_delete.sql	-323144214	leonkul	2026-03-08 21:18:01.056816	1	t
21	21	Add name to orders	SQL	V21__Add_name_to_orders.sql	1163813306	leonkul	2026-03-08 21:18:01.059691	1	t
22	22	Create tariff tables	SQL	V22__Create_tariff_tables.sql	118124377	leonkul	2026-03-08 21:18:01.062953	11	t
23	23	Create shift tables	SQL	V23__Create_shift_tables.sql	2000995551	leonkul	2026-03-08 21:18:01.078323	7	t
24	24	Create analytics tables	SQL	V24__Create_analytics_tables.sql	1550709572	leonkul	2026-03-08 21:18:01.089455	11	t
25	25	Add calendar to tariff plan	SQL	V25__Add_calendar_to_tariff_plan.sql	-846779683	leonkul	2026-03-08 21:18:01.104494	2	t
26	26	Create activities and bookings	SQL	V26__Create_activities_and_bookings.sql	-1954977268	leonkul	2026-03-08 21:18:01.108778	9	t
27	27	Create calendar and special date modifiers	SQL	V27__Create_calendar_and_special_date_modifiers.sql	1279881080	leonkul	2026-03-08 21:18:01.121041	14	t
28	28	Remove application level and currency priority	SQL	V28__Remove_application_level_and_currency_priority.sql	-1043583685	leonkul	2026-03-08 21:18:01.138063	1	t
29	29	Add weekend days to calendar	SQL	V29__Add_weekend_days_to_calendar.sql	-392803479	leonkul	2026-03-08 21:18:01.141909	1	t
30	30	Remove stop check fields	SQL	V30__Remove_stop_check_fields.sql	1080093704	leonkul	2026-03-08 21:18:01.14537	2	t
31	31	Add permissions to users	SQL	V31__Add_permissions_to_users.sql	-1574377422	leonkul	2026-03-08 21:18:01.150025	1	t
32	32	Add comment to order items	SQL	V32__Add_comment_to_order_items.sql	1848588589	leonkul	2026-03-08 21:18:01.153686	1	t
33	33	Create dish categories	SQL	V33__Create_dish_categories.sql	-39071262	leonkul	2026-03-08 21:18:01.156965	3	t
34	34	Add image url to dishes	SQL	V34__Add_image_url_to_dishes.sql	-243566210	leonkul	2026-03-08 21:18:01.161836	13	t
35	35	Create hall map and tables	SQL	V35__Create_hall_map_and_tables.sql	-1757033039	leonkul	2026-03-08 21:18:01.177622	8	t
36	36	Add cells to hall zones	SQL	V36__Add_cells_to_hall_zones.sql	4337033	leonkul	2026-03-08 21:18:01.188817	1	t
37	37	Add version to hall maps	SQL	V37__Add_version_to_hall_maps.sql	-665961689	leonkul	2026-03-08 21:18:01.192091	2	t
38	38	Add vertices to hall zones	SQL	V38__Add_vertices_to_hall_zones.sql	-50133073	leonkul	2026-03-08 21:18:01.197079	1	t
39	39	Create table reservations	SQL	V39__Create_table_reservations.sql	-1290923816	leonkul	2026-03-08 21:18:01.20067	4	t
40	40	Multi table reservations	SQL	V40__Multi_table_reservations.sql	-1792192266	leonkul	2026-03-08 21:18:01.209325	3	t
41	41	Remove refresh token logs	SQL	V41__Remove_refresh_token_logs.sql	-246983779	leonkul	2026-03-08 21:18:01.215202	12	t
42	42	Create loyalty tables	SQL	V42__Create_loyalty_tables.sql	882772027	leonkul	2026-03-08 21:18:01.230058	43	t
43	43	Create booking notifications	SQL	V43__Create_booking_notifications.sql	-737721399	leonkul	2026-03-08 21:18:01.278321	6	t
44	44	Add paid status to bookings	SQL	V44__Add_paid_status_to_bookings.sql	1231095957	leonkul	2026-03-08 21:18:01.286899	1	t
45	45	Add gap filler to activities	SQL	V45__Add_gap_filler_to_activities.sql	-394496489	leonkul	2026-03-08 21:18:01.292777	0	t
46	46	Add stop check hours to activities	SQL	V46__Add_stop_check_hours_to_activities.sql	1337336266	leonkul	2026-03-08 21:18:01.294534	0	t
47	47	Add booking hours to tariff plans	SQL	V47__Add_booking_hours_to_tariff_plans.sql	-2009656832	leonkul	2026-03-08 21:18:01.296467	0	t
48	48	Add booking hours to special date modifiers	SQL	V48__Add_booking_hours_to_special_date_modifiers.sql	-1063858496	leonkul	2026-03-08 21:18:01.298147	0	t
49	49	Add idempotency key to orders	SQL	V49__Add_idempotency_key_to_orders.sql	-1383618459	leonkul	2026-03-08 21:18:01.299865	1	t
50	50	Add order source to orders	SQL	V50__Add_order_source_to_orders.sql	-161106249	leonkul	2026-03-08 21:18:01.304955	0	t
51	51	Create guest sessions	SQL	V51__Create_guest_sessions.sql	25908308	leonkul	2026-03-08 21:18:01.307226	2	t
52	52	Add guest id to orders	SQL	V52__Add_guest_id_to_orders.sql	156845405	leonkul	2026-03-08 21:18:01.311201	1	t
53	53	Add paid at to orders	SQL	V53__Add_paid_at_to_orders.sql	-484084728	leonkul	2026-03-08 21:18:01.31374	0	t
54	54	Add unpaid reason to orders	SQL	V54__Add_unpaid_reason_to_orders.sql	-1501166384	leonkul	2026-03-08 21:18:01.315572	0	t
55	55	Create order shares tables	SQL	V55__Create_order_shares_tables.sql	-182381133	leonkul	2026-03-08 21:18:01.317384	2	t
56	56	Add updated at to dishes	SQL	V56__Add_updated_at_to_dishes.sql	-1757738828	leonkul	2026-03-08 21:18:01.321807	1	t
57	57	Create telegram sessions	SQL	V57__Create_telegram_sessions.sql	1016115770	leonkul	2026-03-08 21:18:01.32484	2	t
58	58	Create dish option tables	SQL	V58__Create_dish_option_tables.sql	-517527793	leonkul	2026-03-08 21:18:01.32891	5	t
59	59	Recreate dish option tables with templates	SQL	V59__Recreate_dish_option_tables_with_templates.sql	-1777118109	leonkul	2026-03-08 21:18:01.336444	6	t
60	60	Add is default to option item templates	SQL	V60__Add_is_default_to_option_item_templates.sql	2086909743	leonkul	2026-03-08 21:18:01.346171	0	t
61	61	Add telegram bot token to restaurants	SQL	V61__Add_telegram_bot_token_to_restaurants.sql	391994188	leonkul	2026-03-08 21:18:01.348925	0	t
62	62	Add qty to order share items	SQL	V62__Add_qty_to_order_share_items.sql	-900374572	leonkul	2026-03-08 21:18:01.351274	1	t
63	63	Create order payment marks	SQL	V63__Create_order_payment_marks.sql	1298872574	leonkul	2026-03-08 21:18:01.354052	1	t
64	64	Add paid via to order payment marks	SQL	V64__Add_paid_via_to_order_payment_marks.sql	150648881	leonkul	2026-03-08 21:18:01.356781	0	t
65	65	Create outbox events	SQL	V65__Create_outbox_events.sql	-1593156877	leonkul	2026-03-08 21:18:01.358856	2	t
66	66	db roles rls platform bypass	SQL	V66__db_roles_rls_platform_bypass.sql	-1981395093	leonkul	2026-03-08 21:18:01.363	2	t
67	67	enable rls all tenant tables	SQL	V67__enable_rls_all_tenant_tables.sql	-459056011	leonkul	2026-03-08 21:18:01.367918	13	t
68	68	loyalty order level idempotency	SQL	V68__loyalty_order_level_idempotency.sql	1832333276	leonkul	2026-03-08 21:18:01.387936	1	t
69	69	loyalty accrual guard	SQL	V69__loyalty_accrual_guard.sql	-1871665322	leonkul	2026-03-08 21:18:01.391048	3	t
70	70	rls full coverage	SQL	V70__rls_full_coverage.sql	651853035	leonkul	2026-03-08 21:18:01.39565	1	t
71	71	users rls allow auth lookup	SQL	V71__users_rls_allow_auth_lookup.sql	-47914883	leonkul	2026-03-08 21:18:01.398909	0	t
72	72	Add qr token expires at to restaurants	SQL	V72__Add_qr_token_expires_at_to_restaurants.sql	-80288923	leonkul	2026-03-08 21:18:01.401125	0	t
73	73	network hierarchy	SQL	V73__network_hierarchy.sql	-1497837685	leonkul	2026-03-08 21:18:01.403088	9	t
74	74	rls location pilot	SQL	V74__rls_location_pilot.sql	-1864259304	leonkul	2026-03-08 21:18:01.414587	14	t
75	75	deactivate test head admin	SQL	V75__deactivate_test_head_admin.sql	-295809153	leonkul	2026-03-08 21:18:01.431358	0	t
76	76	restaurant delete cascade	SQL	V76__restaurant_delete_cascade.sql	-1383829716	postgres	2026-03-18 21:15:25.801904	234	t
77	77	Create booking orders and link	SQL	V77__Create_booking_orders_and_link.sql	-1702961041	postgres	2026-04-06 19:20:45.116404	103	t
78	78	option templates stock ingredients	SQL	V78__option_templates_stock_ingredients.sql	1335361371	postgres	2026-04-06 20:15:43.966214	52	t
79	79	option item template extra ingredients	SQL	V79__option_item_template_extra_ingredients.sql	-2067690692	postgres	2026-04-06 20:16:41.159968	13	t
80	80	option group template scale ingredients	SQL	V80__option_group_template_scale_ingredients.sql	-572705049	postgres	2026-04-06 20:16:41.238729	1	t
81	81	option group template scale ingredients anchor target	SQL	V81__option_group_template_scale_ingredients_anchor_target.sql	-587995191	postgres	2026-04-06 20:16:41.246093	2	t
\.


--
-- Data for Name: loyalty_campaign_segments; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.loyalty_campaign_segments (campaign_id, segment_id) FROM stdin;
\.


--
-- Data for Name: pricing_rule_impact; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.pricing_rule_impact (id, tariff_rule_id, restaurant_id, date, trigger_count, total_impact, average_impact, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: service_performance; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.service_performance (id, restaurant_id, dish_id, date, order_count, total_revenue, average_price, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: stop_check_analytics; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.stop_check_analytics (id, tariff_rule_id, restaurant_id, date, trigger_count, stop_reason, estimated_loss, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tariff_calendars; Type: TABLE DATA; Schema: public; Owner: leonkul
--

COPY public.tariff_calendars (id, name, description, restaurant_id, weekend_days, fixed_holidays, floating_holidays, short_days, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Name: booking_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.booking_orders_id_seq', 1, false);


--
-- Name: daily_branch_revenue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: leonkul
--

SELECT pg_catalog.setval('public.daily_branch_revenue_id_seq', 1, false);


--
-- Name: employee_utilization_id_seq; Type: SEQUENCE SET; Schema: public; Owner: leonkul
--

SELECT pg_catalog.setval('public.employee_utilization_id_seq', 1, false);


--
-- Name: pricing_rule_impact_id_seq; Type: SEQUENCE SET; Schema: public; Owner: leonkul
--

SELECT pg_catalog.setval('public.pricing_rule_impact_id_seq', 1, false);


--
-- Name: service_performance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: leonkul
--

SELECT pg_catalog.setval('public.service_performance_id_seq', 1, false);


--
-- Name: stop_check_analytics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: leonkul
--

SELECT pg_catalog.setval('public.stop_check_analytics_id_seq', 1, false);


--
-- Name: tariff_calendars_id_seq; Type: SEQUENCE SET; Schema: public; Owner: leonkul
--

SELECT pg_catalog.setval('public.tariff_calendars_id_seq', 1, false);


--
-- Name: booking_orders booking_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_orders
    ADD CONSTRAINT booking_orders_pkey PRIMARY KEY (id);


--
-- Name: daily_branch_revenue daily_branch_revenue_pkey; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.daily_branch_revenue
    ADD CONSTRAINT daily_branch_revenue_pkey PRIMARY KEY (id);


--
-- Name: daily_branch_revenue daily_branch_revenue_restaurant_id_date_key; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.daily_branch_revenue
    ADD CONSTRAINT daily_branch_revenue_restaurant_id_date_key UNIQUE (restaurant_id, date);


--
-- Name: employee_utilization employee_utilization_employee_id_restaurant_id_date_key; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.employee_utilization
    ADD CONSTRAINT employee_utilization_employee_id_restaurant_id_date_key UNIQUE (employee_id, restaurant_id, date);


--
-- Name: employee_utilization employee_utilization_pkey; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.employee_utilization
    ADD CONSTRAINT employee_utilization_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history flyway_schema_history_pk; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.flyway_schema_history
    ADD CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank);


--
-- Name: loyalty_campaign_segments loyalty_campaign_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.loyalty_campaign_segments
    ADD CONSTRAINT loyalty_campaign_segments_pkey PRIMARY KEY (campaign_id, segment_id);


--
-- Name: pricing_rule_impact pricing_rule_impact_pkey; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.pricing_rule_impact
    ADD CONSTRAINT pricing_rule_impact_pkey PRIMARY KEY (id);


--
-- Name: pricing_rule_impact pricing_rule_impact_tariff_rule_id_restaurant_id_date_key; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.pricing_rule_impact
    ADD CONSTRAINT pricing_rule_impact_tariff_rule_id_restaurant_id_date_key UNIQUE (tariff_rule_id, restaurant_id, date);


--
-- Name: service_performance service_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.service_performance
    ADD CONSTRAINT service_performance_pkey PRIMARY KEY (id);


--
-- Name: service_performance service_performance_restaurant_id_dish_id_date_key; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.service_performance
    ADD CONSTRAINT service_performance_restaurant_id_dish_id_date_key UNIQUE (restaurant_id, dish_id, date);


--
-- Name: stop_check_analytics stop_check_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.stop_check_analytics
    ADD CONSTRAINT stop_check_analytics_pkey PRIMARY KEY (id);


--
-- Name: tariff_calendars tariff_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: leonkul
--

ALTER TABLE ONLY public.tariff_calendars
    ADD CONSTRAINT tariff_calendars_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history_s_idx; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);


--
-- Name: idx_booking_orders_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_booking_orders_branch ON public.booking_orders USING btree (branch_id);


--
-- Name: idx_daily_revenue_date; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_daily_revenue_date ON public.daily_branch_revenue USING btree (date);


--
-- Name: idx_daily_revenue_restaurant; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_daily_revenue_restaurant ON public.daily_branch_revenue USING btree (restaurant_id);


--
-- Name: idx_emp_util_date; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_emp_util_date ON public.employee_utilization USING btree (date);


--
-- Name: idx_emp_util_employee; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_emp_util_employee ON public.employee_utilization USING btree (employee_id);


--
-- Name: idx_emp_util_restaurant; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_emp_util_restaurant ON public.employee_utilization USING btree (restaurant_id);


--
-- Name: idx_pricing_impact_date; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_pricing_impact_date ON public.pricing_rule_impact USING btree (date);


--
-- Name: idx_pricing_impact_restaurant; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_pricing_impact_restaurant ON public.pricing_rule_impact USING btree (restaurant_id);


--
-- Name: idx_pricing_impact_rule; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_pricing_impact_rule ON public.pricing_rule_impact USING btree (tariff_rule_id);


--
-- Name: idx_service_perf_date; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_service_perf_date ON public.service_performance USING btree (date);


--
-- Name: idx_service_perf_dish; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_service_perf_dish ON public.service_performance USING btree (dish_id);


--
-- Name: idx_service_perf_restaurant; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_service_perf_restaurant ON public.service_performance USING btree (restaurant_id);


--
-- Name: idx_stop_check_date; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_stop_check_date ON public.stop_check_analytics USING btree (date);


--
-- Name: idx_stop_check_restaurant; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_stop_check_restaurant ON public.stop_check_analytics USING btree (restaurant_id);


--
-- Name: idx_stop_check_rule; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_stop_check_rule ON public.stop_check_analytics USING btree (tariff_rule_id);


--
-- Name: idx_tariff_calendars_restaurant; Type: INDEX; Schema: public; Owner: leonkul
--

CREATE INDEX idx_tariff_calendars_restaurant ON public.tariff_calendars USING btree (restaurant_id);


--
-- Name: booking_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.booking_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_branch_revenue; Type: ROW SECURITY; Schema: public; Owner: leonkul
--

ALTER TABLE public.daily_branch_revenue ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_utilization; Type: ROW SECURITY; Schema: public; Owner: leonkul
--

ALTER TABLE public.employee_utilization ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rule_impact; Type: ROW SECURITY; Schema: public; Owner: leonkul
--

ALTER TABLE public.pricing_rule_impact ENABLE ROW LEVEL SECURITY;

--
-- Name: service_performance; Type: ROW SECURITY; Schema: public; Owner: leonkul
--

ALTER TABLE public.service_performance ENABLE ROW LEVEL SECURITY;

--
-- Name: stop_check_analytics; Type: ROW SECURITY; Schema: public; Owner: leonkul
--

ALTER TABLE public.stop_check_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: tariff_calendars; Type: ROW SECURITY; Schema: public; Owner: leonkul
--

ALTER TABLE public.tariff_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_orders tenant_isolation_booking_orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_booking_orders ON public.booking_orders USING ((branch_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint)) WITH CHECK ((branch_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint));


--
-- Name: daily_branch_revenue tenant_isolation_daily_branch_revenue; Type: POLICY; Schema: public; Owner: leonkul
--

CREATE POLICY tenant_isolation_daily_branch_revenue ON public.daily_branch_revenue USING ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint)) WITH CHECK ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint));


--
-- Name: employee_utilization tenant_isolation_employee_utilization; Type: POLICY; Schema: public; Owner: leonkul
--

CREATE POLICY tenant_isolation_employee_utilization ON public.employee_utilization USING ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint)) WITH CHECK ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint));


--
-- Name: pricing_rule_impact tenant_isolation_pricing_rule_impact; Type: POLICY; Schema: public; Owner: leonkul
--

CREATE POLICY tenant_isolation_pricing_rule_impact ON public.pricing_rule_impact USING ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint)) WITH CHECK ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint));


--
-- Name: service_performance tenant_isolation_service_performance; Type: POLICY; Schema: public; Owner: leonkul
--

CREATE POLICY tenant_isolation_service_performance ON public.service_performance USING ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint)) WITH CHECK ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint));


--
-- Name: stop_check_analytics tenant_isolation_stop_check_analytics; Type: POLICY; Schema: public; Owner: leonkul
--

CREATE POLICY tenant_isolation_stop_check_analytics ON public.stop_check_analytics USING ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint)) WITH CHECK ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint));


--
-- Name: tariff_calendars tenant_isolation_tariff_calendars; Type: POLICY; Schema: public; Owner: leonkul
--

CREATE POLICY tenant_isolation_tariff_calendars ON public.tariff_calendars USING ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint)) WITH CHECK ((restaurant_id = (NULLIF(current_setting('app.current_restaurant_id'::text, true), ''::text))::bigint));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: leonkul
--

GRANT USAGE ON SCHEMA public TO app_tenant;
GRANT USAGE ON SCHEMA public TO app_platform;


--
-- Name: TABLE daily_branch_revenue; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.daily_branch_revenue TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.daily_branch_revenue TO app_platform;


--
-- Name: TABLE employee_utilization; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_utilization TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_utilization TO app_platform;


--
-- Name: TABLE flyway_schema_history; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flyway_schema_history TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flyway_schema_history TO app_platform;


--
-- Name: TABLE loyalty_campaign_segments; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.loyalty_campaign_segments TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.loyalty_campaign_segments TO app_platform;


--
-- Name: TABLE pricing_rule_impact; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pricing_rule_impact TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pricing_rule_impact TO app_platform;


--
-- Name: TABLE service_performance; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_performance TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_performance TO app_platform;


--
-- Name: TABLE stop_check_analytics; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.stop_check_analytics TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.stop_check_analytics TO app_platform;


--
-- Name: TABLE tariff_calendars; Type: ACL; Schema: public; Owner: leonkul
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tariff_calendars TO app_tenant;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tariff_calendars TO app_platform;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: leonkul
--

ALTER DEFAULT PRIVILEGES FOR ROLE leonkul IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES  TO app_tenant;
ALTER DEFAULT PRIVILEGES FOR ROLE leonkul IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES  TO app_platform;


--
-- PostgreSQL database dump complete
--

\unrestrict RSLOfVme8dhZXkLL1GMu3bnqQD1Ll0ux6bK0iKVS1EJu80Umw798SVKcR8MZQLl

