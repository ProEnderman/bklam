--
-- PostgreSQL database dump
--

\restrict Db40kjNlViXPEED6ofJzwcTJk1dIXri4ivlSFXRTlKUDXXDure9eUkDLD1CK5Dy

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
-- PostgreSQL database dump complete
--

\unrestrict Db40kjNlViXPEED6ofJzwcTJk1dIXri4ivlSFXRTlKUDXXDure9eUkDLD1CK5Dy

