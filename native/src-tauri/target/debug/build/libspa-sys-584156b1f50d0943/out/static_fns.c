#include "wrapper.h"

// Static wrappers

void * spa_meta_first_libspa_rs(const struct spa_meta *m) { return spa_meta_first(m); }
void * spa_meta_end_libspa_rs(const struct spa_meta *m) { return spa_meta_end(m); }
bool spa_meta_region_is_valid_libspa_rs(const struct spa_meta_region *m) { return spa_meta_region_is_valid(m); }
struct spa_meta * spa_buffer_find_meta_libspa_rs(const struct spa_buffer *b, uint32_t type) { return spa_buffer_find_meta(b, type); }
void * spa_buffer_find_meta_data_libspa_rs(const struct spa_buffer *b, uint32_t type, size_t size) { return spa_buffer_find_meta_data(b, type, size); }
int spa_buffer_alloc_fill_info_libspa_rs(struct spa_buffer_alloc_info *info, uint32_t n_metas, struct spa_meta metas [0], uint32_t n_datas, struct spa_data datas [0], uint32_t data_aligns [0]) { return spa_buffer_alloc_fill_info(info, n_metas, metas, n_datas, datas, data_aligns); }
struct spa_buffer * spa_buffer_alloc_layout_libspa_rs(struct spa_buffer_alloc_info *info, void *skel_mem, void *data_mem) { return spa_buffer_alloc_layout(info, skel_mem, data_mem); }
int spa_buffer_alloc_layout_array_libspa_rs(struct spa_buffer_alloc_info *info, uint32_t n_buffers, struct spa_buffer *buffers [0], void *skel_mem, void *data_mem) { return spa_buffer_alloc_layout_array(info, n_buffers, buffers, skel_mem, data_mem); }
struct spa_buffer ** spa_buffer_alloc_array_libspa_rs(uint32_t n_buffers, uint32_t flags, uint32_t n_metas, struct spa_meta metas [0], uint32_t n_datas, struct spa_data datas [0], uint32_t data_aligns [0]) { return spa_buffer_alloc_array(n_buffers, flags, n_metas, metas, n_datas, datas, data_aligns); }
bool spa_type_is_a_libspa_rs(const char *type, const char *parent) { return spa_type_is_a(type, parent); }
int spa_debugc_mem_libspa_rs(struct spa_debug_context *ctx, int indent, const void *data, size_t size) { return spa_debugc_mem(ctx, indent, data, size); }
int spa_debug_mem_libspa_rs(int indent, const void *data, size_t size) { return spa_debug_mem(indent, data, size); }
const struct spa_type_info * spa_debug_type_find_libspa_rs(const struct spa_type_info *info, uint32_t type) { return spa_debug_type_find(info, type); }
const char * spa_debug_type_short_name_libspa_rs(const char *name) { return spa_debug_type_short_name(name); }
const char * spa_debug_type_find_name_libspa_rs(const struct spa_type_info *info, uint32_t type) { return spa_debug_type_find_name(info, type); }
const char * spa_debug_type_find_short_name_libspa_rs(const struct spa_type_info *info, uint32_t type) { return spa_debug_type_find_short_name(info, type); }
uint32_t spa_debug_type_find_type_libspa_rs(const struct spa_type_info *info, const char *name) { return spa_debug_type_find_type(info, name); }
const struct spa_type_info * spa_debug_type_find_short_libspa_rs(const struct spa_type_info *info, const char *name) { return spa_debug_type_find_short(info, name); }
uint32_t spa_debug_type_find_type_short_libspa_rs(const struct spa_type_info *info, const char *name) { return spa_debug_type_find_type_short(info, name); }
int spa_debugc_buffer_libspa_rs(struct spa_debug_context *ctx, int indent, const struct spa_buffer *buffer) { return spa_debugc_buffer(ctx, indent, buffer); }
int spa_debug_buffer_libspa_rs(int indent, const struct spa_buffer *buffer) { return spa_debug_buffer(indent, buffer); }
int spa_dict_item_compare_libspa_rs(const void *i1, const void *i2) { return spa_dict_item_compare(i1, i2); }
void spa_dict_qsort_libspa_rs(struct spa_dict *dict) { spa_dict_qsort(dict); }
const struct spa_dict_item * spa_dict_lookup_item_libspa_rs(const struct spa_dict *dict, const char *key) { return spa_dict_lookup_item(dict, key); }
const char * spa_dict_lookup_libspa_rs(const struct spa_dict *dict, const char *key) { return spa_dict_lookup(dict, key); }
int spa_debugc_dict_libspa_rs(struct spa_debug_context *ctx, int indent, const struct spa_dict *dict) { return spa_debugc_dict(ctx, indent, dict); }
int spa_debug_dict_libspa_rs(int indent, const struct spa_dict *dict) { return spa_debug_dict(indent, dict); }
bool spa_pod_is_inside_libspa_rs(const void *pod, uint32_t size, const void *iter) { return spa_pod_is_inside(pod, size, iter); }
void * spa_pod_next_libspa_rs(const void *iter) { return spa_pod_next(iter); }
struct spa_pod_prop * spa_pod_prop_first_libspa_rs(const struct spa_pod_object_body *body) { return spa_pod_prop_first(body); }
bool spa_pod_prop_is_inside_libspa_rs(const struct spa_pod_object_body *body, uint32_t size, const struct spa_pod_prop *iter) { return spa_pod_prop_is_inside(body, size, iter); }
struct spa_pod_prop * spa_pod_prop_next_libspa_rs(const struct spa_pod_prop *iter) { return spa_pod_prop_next(iter); }
struct spa_pod_control * spa_pod_control_first_libspa_rs(const struct spa_pod_sequence_body *body) { return spa_pod_control_first(body); }
bool spa_pod_control_is_inside_libspa_rs(const struct spa_pod_sequence_body *body, uint32_t size, const struct spa_pod_control *iter) { return spa_pod_control_is_inside(body, size, iter); }
struct spa_pod_control * spa_pod_control_next_libspa_rs(const struct spa_pod_control *iter) { return spa_pod_control_next(iter); }
void * spa_pod_from_data_libspa_rs(void *data, size_t maxsize, off_t offset, size_t size) { return spa_pod_from_data(data, maxsize, offset, size); }
int spa_pod_is_none_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_none(pod); }
int spa_pod_is_bool_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_bool(pod); }
int spa_pod_get_bool_libspa_rs(const struct spa_pod *pod, bool *value) { return spa_pod_get_bool(pod, value); }
int spa_pod_is_id_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_id(pod); }
int spa_pod_get_id_libspa_rs(const struct spa_pod *pod, uint32_t *value) { return spa_pod_get_id(pod, value); }
int spa_pod_is_int_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_int(pod); }
int spa_pod_get_int_libspa_rs(const struct spa_pod *pod, int32_t *value) { return spa_pod_get_int(pod, value); }
int spa_pod_is_long_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_long(pod); }
int spa_pod_get_long_libspa_rs(const struct spa_pod *pod, int64_t *value) { return spa_pod_get_long(pod, value); }
int spa_pod_is_float_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_float(pod); }
int spa_pod_get_float_libspa_rs(const struct spa_pod *pod, float *value) { return spa_pod_get_float(pod, value); }
int spa_pod_is_double_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_double(pod); }
int spa_pod_get_double_libspa_rs(const struct spa_pod *pod, double *value) { return spa_pod_get_double(pod, value); }
int spa_pod_is_string_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_string(pod); }
int spa_pod_get_string_libspa_rs(const struct spa_pod *pod, const char **value) { return spa_pod_get_string(pod, value); }
int spa_pod_copy_string_libspa_rs(const struct spa_pod *pod, size_t maxlen, char *dest) { return spa_pod_copy_string(pod, maxlen, dest); }
int spa_pod_is_bytes_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_bytes(pod); }
int spa_pod_get_bytes_libspa_rs(const struct spa_pod *pod, const void **value, uint32_t *len) { return spa_pod_get_bytes(pod, value, len); }
int spa_pod_is_pointer_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_pointer(pod); }
int spa_pod_get_pointer_libspa_rs(const struct spa_pod *pod, uint32_t *type, const void **value) { return spa_pod_get_pointer(pod, type, value); }
int spa_pod_is_fd_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_fd(pod); }
int spa_pod_get_fd_libspa_rs(const struct spa_pod *pod, int64_t *value) { return spa_pod_get_fd(pod, value); }
int spa_pod_is_rectangle_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_rectangle(pod); }
int spa_pod_get_rectangle_libspa_rs(const struct spa_pod *pod, struct spa_rectangle *value) { return spa_pod_get_rectangle(pod, value); }
int spa_pod_is_fraction_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_fraction(pod); }
int spa_pod_get_fraction_libspa_rs(const struct spa_pod *pod, struct spa_fraction *value) { return spa_pod_get_fraction(pod, value); }
int spa_pod_is_bitmap_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_bitmap(pod); }
int spa_pod_is_array_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_array(pod); }
void * spa_pod_get_array_libspa_rs(const struct spa_pod *pod, uint32_t *n_values) { return spa_pod_get_array(pod, n_values); }
uint32_t spa_pod_copy_array_libspa_rs(const struct spa_pod *pod, uint32_t type, void *values, uint32_t max_values) { return spa_pod_copy_array(pod, type, values, max_values); }
int spa_pod_is_choice_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_choice(pod); }
struct spa_pod * spa_pod_get_values_libspa_rs(const struct spa_pod *pod, uint32_t *n_vals, uint32_t *choice) { return spa_pod_get_values(pod, n_vals, choice); }
int spa_pod_is_struct_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_struct(pod); }
int spa_pod_is_object_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_object(pod); }
bool spa_pod_is_object_type_libspa_rs(const struct spa_pod *pod, uint32_t type) { return spa_pod_is_object_type(pod, type); }
bool spa_pod_is_object_id_libspa_rs(const struct spa_pod *pod, uint32_t id) { return spa_pod_is_object_id(pod, id); }
int spa_pod_is_sequence_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_sequence(pod); }
const struct spa_pod_prop * spa_pod_object_find_prop_libspa_rs(const struct spa_pod_object *pod, const struct spa_pod_prop *start, uint32_t key) { return spa_pod_object_find_prop(pod, start, key); }
const struct spa_pod_prop * spa_pod_find_prop_libspa_rs(const struct spa_pod *pod, const struct spa_pod_prop *start, uint32_t key) { return spa_pod_find_prop(pod, start, key); }
int spa_pod_object_fixate_libspa_rs(struct spa_pod_object *pod) { return spa_pod_object_fixate(pod); }
int spa_pod_fixate_libspa_rs(struct spa_pod *pod) { return spa_pod_fixate(pod); }
int spa_pod_object_is_fixated_libspa_rs(const struct spa_pod_object *pod) { return spa_pod_object_is_fixated(pod); }
int spa_pod_is_fixated_libspa_rs(const struct spa_pod *pod) { return spa_pod_is_fixated(pod); }
void spa_pod_parser_init_libspa_rs(struct spa_pod_parser *parser, const void *data, uint32_t size) { spa_pod_parser_init(parser, data, size); }
void spa_pod_parser_pod_libspa_rs(struct spa_pod_parser *parser, const struct spa_pod *pod) { spa_pod_parser_pod(parser, pod); }
void spa_pod_parser_get_state_libspa_rs(struct spa_pod_parser *parser, struct spa_pod_parser_state *state) { spa_pod_parser_get_state(parser, state); }
void spa_pod_parser_reset_libspa_rs(struct spa_pod_parser *parser, struct spa_pod_parser_state *state) { spa_pod_parser_reset(parser, state); }
struct spa_pod * spa_pod_parser_deref_libspa_rs(struct spa_pod_parser *parser, uint32_t offset, uint32_t size) { return spa_pod_parser_deref(parser, offset, size); }
struct spa_pod * spa_pod_parser_frame_libspa_rs(struct spa_pod_parser *parser, struct spa_pod_frame *frame) { return spa_pod_parser_frame(parser, frame); }
void spa_pod_parser_push_libspa_rs(struct spa_pod_parser *parser, struct spa_pod_frame *frame, const struct spa_pod *pod, uint32_t offset) { spa_pod_parser_push(parser, frame, pod, offset); }
struct spa_pod * spa_pod_parser_current_libspa_rs(struct spa_pod_parser *parser) { return spa_pod_parser_current(parser); }
void spa_pod_parser_advance_libspa_rs(struct spa_pod_parser *parser, const struct spa_pod *pod) { spa_pod_parser_advance(parser, pod); }
struct spa_pod * spa_pod_parser_next_libspa_rs(struct spa_pod_parser *parser) { return spa_pod_parser_next(parser); }
int spa_pod_parser_pop_libspa_rs(struct spa_pod_parser *parser, struct spa_pod_frame *frame) { return spa_pod_parser_pop(parser, frame); }
int spa_pod_parser_get_bool_libspa_rs(struct spa_pod_parser *parser, bool *value) { return spa_pod_parser_get_bool(parser, value); }
int spa_pod_parser_get_id_libspa_rs(struct spa_pod_parser *parser, uint32_t *value) { return spa_pod_parser_get_id(parser, value); }
int spa_pod_parser_get_int_libspa_rs(struct spa_pod_parser *parser, int32_t *value) { return spa_pod_parser_get_int(parser, value); }
int spa_pod_parser_get_long_libspa_rs(struct spa_pod_parser *parser, int64_t *value) { return spa_pod_parser_get_long(parser, value); }
int spa_pod_parser_get_float_libspa_rs(struct spa_pod_parser *parser, float *value) { return spa_pod_parser_get_float(parser, value); }
int spa_pod_parser_get_double_libspa_rs(struct spa_pod_parser *parser, double *value) { return spa_pod_parser_get_double(parser, value); }
int spa_pod_parser_get_string_libspa_rs(struct spa_pod_parser *parser, const char **value) { return spa_pod_parser_get_string(parser, value); }
int spa_pod_parser_get_bytes_libspa_rs(struct spa_pod_parser *parser, const void **value, uint32_t *len) { return spa_pod_parser_get_bytes(parser, value, len); }
int spa_pod_parser_get_pointer_libspa_rs(struct spa_pod_parser *parser, uint32_t *type, const void **value) { return spa_pod_parser_get_pointer(parser, type, value); }
int spa_pod_parser_get_fd_libspa_rs(struct spa_pod_parser *parser, int64_t *value) { return spa_pod_parser_get_fd(parser, value); }
int spa_pod_parser_get_rectangle_libspa_rs(struct spa_pod_parser *parser, struct spa_rectangle *value) { return spa_pod_parser_get_rectangle(parser, value); }
int spa_pod_parser_get_fraction_libspa_rs(struct spa_pod_parser *parser, struct spa_fraction *value) { return spa_pod_parser_get_fraction(parser, value); }
int spa_pod_parser_get_pod_libspa_rs(struct spa_pod_parser *parser, struct spa_pod **value) { return spa_pod_parser_get_pod(parser, value); }
int spa_pod_parser_push_struct_libspa_rs(struct spa_pod_parser *parser, struct spa_pod_frame *frame) { return spa_pod_parser_push_struct(parser, frame); }
int spa_pod_parser_push_object_libspa_rs(struct spa_pod_parser *parser, struct spa_pod_frame *frame, uint32_t type, uint32_t *id) { return spa_pod_parser_push_object(parser, frame, type, id); }
bool spa_pod_parser_can_collect_libspa_rs(const struct spa_pod *pod, char type) { return spa_pod_parser_can_collect(pod, type); }
int spa_pod_parser_getv_libspa_rs(struct spa_pod_parser *parser, va_list args) { return spa_pod_parser_getv(parser, args); }
bool spa_streq_libspa_rs(const char *s1, const char *s2) { return spa_streq(s1, s2); }
bool spa_strneq_libspa_rs(const char *s1, const char *s2, size_t len) { return spa_strneq(s1, s2, len); }
bool spa_strstartswith_libspa_rs(const char *s, const char *prefix) { return spa_strstartswith(s, prefix); }
bool spa_strendswith_libspa_rs(const char *s, const char *suffix) { return spa_strendswith(s, suffix); }
bool spa_atoi32_libspa_rs(const char *str, int32_t *val, int base) { return spa_atoi32(str, val, base); }
bool spa_atou32_libspa_rs(const char *str, uint32_t *val, int base) { return spa_atou32(str, val, base); }
bool spa_atoi64_libspa_rs(const char *str, int64_t *val, int base) { return spa_atoi64(str, val, base); }
bool spa_atou64_libspa_rs(const char *str, uint64_t *val, int base) { return spa_atou64(str, val, base); }
bool spa_atob_libspa_rs(const char *str) { return spa_atob(str); }
int spa_vscnprintf_libspa_rs(char *buffer, size_t size, const char *format, va_list args) { return spa_vscnprintf(buffer, size, format, args); }
float spa_strtof_libspa_rs(const char *str, char **endptr) { return spa_strtof(str, endptr); }
bool spa_atof_libspa_rs(const char *str, float *val) { return spa_atof(str, val); }
double spa_strtod_libspa_rs(const char *str, char **endptr) { return spa_strtod(str, endptr); }
bool spa_atod_libspa_rs(const char *str, double *val) { return spa_atod(str, val); }
char * spa_dtoa_libspa_rs(char *str, size_t size, double val) { return spa_dtoa(str, size, val); }
void spa_strbuf_init_libspa_rs(struct spa_strbuf *buf, char *buffer, size_t maxsize) { spa_strbuf_init(buf, buffer, maxsize); }
int spa_format_parse_libspa_rs(const struct spa_pod *format, uint32_t *media_type, uint32_t *media_subtype) { return spa_format_parse(format, media_type, media_subtype); }
int spa_debug_strbuf_format_value_libspa_rs(struct spa_strbuf *buffer, const struct spa_type_info *info, uint32_t type, void *body, uint32_t size) { return spa_debug_strbuf_format_value(buffer, info, type, body, size); }
int spa_debug_format_value_libspa_rs(const struct spa_type_info *info, uint32_t type, void *body, uint32_t size) { return spa_debug_format_value(info, type, body, size); }
int spa_debugc_format_libspa_rs(struct spa_debug_context *ctx, int indent, const struct spa_type_info *info, const struct spa_pod *format) { return spa_debugc_format(ctx, indent, info, format); }
int spa_debug_format_libspa_rs(int indent, const struct spa_type_info *info, const struct spa_pod *format) { return spa_debug_format(indent, info, format); }
void spa_list_init_libspa_rs(struct spa_list *list) { spa_list_init(list); }
int spa_list_is_initialized_libspa_rs(struct spa_list *list) { return spa_list_is_initialized(list); }
void spa_list_insert_libspa_rs(struct spa_list *list, struct spa_list *elem) { spa_list_insert(list, elem); }
void spa_list_insert_list_libspa_rs(struct spa_list *list, struct spa_list *other) { spa_list_insert_list(list, other); }
void spa_list_remove_libspa_rs(struct spa_list *elem) { spa_list_remove(elem); }
void spa_hook_list_init_libspa_rs(struct spa_hook_list *list) { spa_hook_list_init(list); }
bool spa_hook_list_is_empty_libspa_rs(struct spa_hook_list *list) { return spa_hook_list_is_empty(list); }
void spa_hook_list_append_libspa_rs(struct spa_hook_list *list, struct spa_hook *hook, const void *funcs, void *data) { spa_hook_list_append(list, hook, funcs, data); }
void spa_hook_list_prepend_libspa_rs(struct spa_hook_list *list, struct spa_hook *hook, const void *funcs, void *data) { spa_hook_list_prepend(list, hook, funcs, data); }
void spa_hook_remove_libspa_rs(struct spa_hook *hook) { spa_hook_remove(hook); }
void spa_hook_list_clean_libspa_rs(struct spa_hook_list *list) { spa_hook_list_clean(list); }
void spa_hook_list_isolate_libspa_rs(struct spa_hook_list *list, struct spa_hook_list *save, struct spa_hook *hook, const void *funcs, void *data) { spa_hook_list_isolate(list, save, hook, funcs, data); }
void spa_hook_list_join_libspa_rs(struct spa_hook_list *list, struct spa_hook_list *save) { spa_hook_list_join(list, save); }
int spa_debugc_port_info_libspa_rs(struct spa_debug_context *ctx, int indent, const struct spa_port_info *info) { return spa_debugc_port_info(ctx, indent, info); }
int spa_debug_port_info_libspa_rs(int indent, const struct spa_port_info *info) { return spa_debug_port_info(indent, info); }
int spa_debugc_pod_value_libspa_rs(struct spa_debug_context *ctx, int indent, const struct spa_type_info *info, uint32_t type, void *body, uint32_t size) { return spa_debugc_pod_value(ctx, indent, info, type, body, size); }
int spa_debugc_pod_libspa_rs(struct spa_debug_context *ctx, int indent, const struct spa_type_info *info, const struct spa_pod *pod) { return spa_debugc_pod(ctx, indent, info, pod); }
int spa_debug_pod_value_libspa_rs(int indent, const struct spa_type_info *info, uint32_t type, void *body, uint32_t size) { return spa_debug_pod_value(indent, info, type, body, size); }
int spa_debug_pod_libspa_rs(int indent, const struct spa_type_info *info, const struct spa_pod *pod) { return spa_debug_pod(indent, info, pod); }
void spa_graph_state_reset_libspa_rs(struct spa_graph_state *state) { spa_graph_state_reset(state); }
int spa_graph_link_trigger_libspa_rs(struct spa_graph_link *link) { return spa_graph_link_trigger(link); }
int spa_graph_node_trigger_libspa_rs(struct spa_graph_node *node) { return spa_graph_node_trigger(node); }
int spa_graph_run_libspa_rs(struct spa_graph *graph) { return spa_graph_run(graph); }
int spa_graph_finish_libspa_rs(struct spa_graph *graph) { return spa_graph_finish(graph); }
int spa_graph_link_signal_node_libspa_rs(void *data) { return spa_graph_link_signal_node(data); }
int spa_graph_link_signal_graph_libspa_rs(void *data) { return spa_graph_link_signal_graph(data); }
void spa_graph_init_libspa_rs(struct spa_graph *graph, struct spa_graph_state *state) { spa_graph_init(graph, state); }
void spa_graph_link_add_libspa_rs(struct spa_graph_node *out, struct spa_graph_state *state, struct spa_graph_link *link) { spa_graph_link_add(out, state, link); }
void spa_graph_link_remove_libspa_rs(struct spa_graph_link *link) { spa_graph_link_remove(link); }
void spa_graph_node_init_libspa_rs(struct spa_graph_node *node, struct spa_graph_state *state) { spa_graph_node_init(node, state); }
int spa_graph_node_impl_sub_process_libspa_rs(void *data, struct spa_graph_node *node) { return spa_graph_node_impl_sub_process(data, node); }
void spa_graph_node_set_subgraph_libspa_rs(struct spa_graph_node *node, struct spa_graph *subgraph) { spa_graph_node_set_subgraph(node, subgraph); }
void spa_graph_node_set_callbacks_libspa_rs(struct spa_graph_node *node, const struct spa_graph_node_callbacks *callbacks, void *data) { spa_graph_node_set_callbacks(node, callbacks, data); }
void spa_graph_node_add_libspa_rs(struct spa_graph *graph, struct spa_graph_node *node) { spa_graph_node_add(graph, node); }
void spa_graph_node_remove_libspa_rs(struct spa_graph_node *node) { spa_graph_node_remove(node); }
void spa_graph_port_init_libspa_rs(struct spa_graph_port *port, enum spa_direction direction, uint32_t port_id, uint32_t flags) { spa_graph_port_init(port, direction, port_id, flags); }
void spa_graph_port_add_libspa_rs(struct spa_graph_node *node, struct spa_graph_port *port) { spa_graph_port_add(node, port); }
void spa_graph_port_remove_libspa_rs(struct spa_graph_port *port) { spa_graph_port_remove(port); }
void spa_graph_port_link_libspa_rs(struct spa_graph_port *out, struct spa_graph_port *in) { spa_graph_port_link(out, in); }
void spa_graph_port_unlink_libspa_rs(struct spa_graph_port *port) { spa_graph_port_unlink(port); }
int spa_graph_node_impl_process_libspa_rs(void *data, struct spa_graph_node *node) { return spa_graph_node_impl_process(data, node); }
int spa_graph_node_impl_reuse_buffer_libspa_rs(void *data, struct spa_graph_node *node, uint32_t port_id, uint32_t buffer_id) { return spa_graph_node_impl_reuse_buffer(data, node, port_id, buffer_id); }
void spa_pod_builder_get_state_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_builder_state *state) { spa_pod_builder_get_state(builder, state); }
void spa_pod_builder_set_callbacks_libspa_rs(struct spa_pod_builder *builder, const struct spa_pod_builder_callbacks *callbacks, void *data) { spa_pod_builder_set_callbacks(builder, callbacks, data); }
void spa_pod_builder_reset_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_builder_state *state) { spa_pod_builder_reset(builder, state); }
void spa_pod_builder_init_libspa_rs(struct spa_pod_builder *builder, void *data, uint32_t size) { spa_pod_builder_init(builder, data, size); }
struct spa_pod * spa_pod_builder_deref_libspa_rs(struct spa_pod_builder *builder, uint32_t offset) { return spa_pod_builder_deref(builder, offset); }
struct spa_pod * spa_pod_builder_frame_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame) { return spa_pod_builder_frame(builder, frame); }
void spa_pod_builder_push_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame, const struct spa_pod *pod, uint32_t offset) { spa_pod_builder_push(builder, frame, pod, offset); }
int spa_pod_builder_raw_libspa_rs(struct spa_pod_builder *builder, const void *data, uint32_t size) { return spa_pod_builder_raw(builder, data, size); }
int spa_pod_builder_pad_libspa_rs(struct spa_pod_builder *builder, uint32_t size) { return spa_pod_builder_pad(builder, size); }
int spa_pod_builder_raw_padded_libspa_rs(struct spa_pod_builder *builder, const void *data, uint32_t size) { return spa_pod_builder_raw_padded(builder, data, size); }
void * spa_pod_builder_pop_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame) { return spa_pod_builder_pop(builder, frame); }
int spa_pod_builder_primitive_libspa_rs(struct spa_pod_builder *builder, const struct spa_pod *p) { return spa_pod_builder_primitive(builder, p); }
int spa_pod_builder_none_libspa_rs(struct spa_pod_builder *builder) { return spa_pod_builder_none(builder); }
int spa_pod_builder_child_libspa_rs(struct spa_pod_builder *builder, uint32_t size, uint32_t type) { return spa_pod_builder_child(builder, size, type); }
int spa_pod_builder_bool_libspa_rs(struct spa_pod_builder *builder, bool val) { return spa_pod_builder_bool(builder, val); }
int spa_pod_builder_id_libspa_rs(struct spa_pod_builder *builder, uint32_t val) { return spa_pod_builder_id(builder, val); }
int spa_pod_builder_int_libspa_rs(struct spa_pod_builder *builder, int32_t val) { return spa_pod_builder_int(builder, val); }
int spa_pod_builder_long_libspa_rs(struct spa_pod_builder *builder, int64_t val) { return spa_pod_builder_long(builder, val); }
int spa_pod_builder_float_libspa_rs(struct spa_pod_builder *builder, float val) { return spa_pod_builder_float(builder, val); }
int spa_pod_builder_double_libspa_rs(struct spa_pod_builder *builder, double val) { return spa_pod_builder_double(builder, val); }
int spa_pod_builder_write_string_libspa_rs(struct spa_pod_builder *builder, const char *str, uint32_t len) { return spa_pod_builder_write_string(builder, str, len); }
int spa_pod_builder_string_len_libspa_rs(struct spa_pod_builder *builder, const char *str, uint32_t len) { return spa_pod_builder_string_len(builder, str, len); }
int spa_pod_builder_string_libspa_rs(struct spa_pod_builder *builder, const char *str) { return spa_pod_builder_string(builder, str); }
int spa_pod_builder_bytes_libspa_rs(struct spa_pod_builder *builder, const void *bytes, uint32_t len) { return spa_pod_builder_bytes(builder, bytes, len); }
void * spa_pod_builder_reserve_bytes_libspa_rs(struct spa_pod_builder *builder, uint32_t len) { return spa_pod_builder_reserve_bytes(builder, len); }
int spa_pod_builder_pointer_libspa_rs(struct spa_pod_builder *builder, uint32_t type, const void *val) { return spa_pod_builder_pointer(builder, type, val); }
int spa_pod_builder_fd_libspa_rs(struct spa_pod_builder *builder, int64_t fd) { return spa_pod_builder_fd(builder, fd); }
int spa_pod_builder_rectangle_libspa_rs(struct spa_pod_builder *builder, uint32_t width, uint32_t height) { return spa_pod_builder_rectangle(builder, width, height); }
int spa_pod_builder_fraction_libspa_rs(struct spa_pod_builder *builder, uint32_t num, uint32_t denom) { return spa_pod_builder_fraction(builder, num, denom); }
int spa_pod_builder_push_array_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame) { return spa_pod_builder_push_array(builder, frame); }
int spa_pod_builder_array_libspa_rs(struct spa_pod_builder *builder, uint32_t child_size, uint32_t child_type, uint32_t n_elems, const void *elems) { return spa_pod_builder_array(builder, child_size, child_type, n_elems, elems); }
int spa_pod_builder_push_choice_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame, uint32_t type, uint32_t flags) { return spa_pod_builder_push_choice(builder, frame, type, flags); }
int spa_pod_builder_push_struct_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame) { return spa_pod_builder_push_struct(builder, frame); }
int spa_pod_builder_push_object_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame, uint32_t type, uint32_t id) { return spa_pod_builder_push_object(builder, frame, type, id); }
int spa_pod_builder_prop_libspa_rs(struct spa_pod_builder *builder, uint32_t key, uint32_t flags) { return spa_pod_builder_prop(builder, key, flags); }
int spa_pod_builder_push_sequence_libspa_rs(struct spa_pod_builder *builder, struct spa_pod_frame *frame, uint32_t unit) { return spa_pod_builder_push_sequence(builder, frame, unit); }
int spa_pod_builder_control_libspa_rs(struct spa_pod_builder *builder, uint32_t offset, uint32_t type) { return spa_pod_builder_control(builder, offset, type); }
uint32_t spa_choice_from_id_libspa_rs(char id) { return spa_choice_from_id(id); }
int spa_pod_builder_addv_libspa_rs(struct spa_pod_builder *builder, va_list args) { return spa_pod_builder_addv(builder, args); }
struct spa_pod * spa_pod_copy_libspa_rs(const struct spa_pod *pod) { return spa_pod_copy(pod); }
void spa_result_func_device_params_libspa_rs(void *data, int seq, int res, uint32_t type, const void *result) { spa_result_func_device_params(data, seq, res, type, result); }
int spa_device_enum_params_sync_libspa_rs(struct spa_device *device, uint32_t id, uint32_t *index, const struct spa_pod *filter, struct spa_pod **param, struct spa_pod_builder *builder) { return spa_device_enum_params_sync(device, id, index, filter, param, builder); }
void spa_result_func_node_params_libspa_rs(void *data, int seq, int res, uint32_t type, const void *result) { spa_result_func_node_params(data, seq, res, type, result); }
int spa_node_enum_params_sync_libspa_rs(struct spa_node *node, uint32_t id, uint32_t *index, const struct spa_pod *filter, struct spa_pod **param, struct spa_pod_builder *builder) { return spa_node_enum_params_sync(node, id, index, filter, param, builder); }
int spa_node_port_enum_params_sync_libspa_rs(struct spa_node *node, enum spa_direction direction, uint32_t port_id, uint32_t id, uint32_t *index, const struct spa_pod *filter, struct spa_pod **param, struct spa_pod_builder *builder) { return spa_node_port_enum_params_sync(node, direction, port_id, id, index, filter, param, builder); }
int spa_latency_info_compare_libspa_rs(const struct spa_latency_info *a, const struct spa_latency_info *b) { return spa_latency_info_compare(a, b); }
void spa_latency_info_combine_start_libspa_rs(struct spa_latency_info *info, enum spa_direction direction) { spa_latency_info_combine_start(info, direction); }
void spa_latency_info_combine_finish_libspa_rs(struct spa_latency_info *info) { spa_latency_info_combine_finish(info); }
int spa_latency_info_combine_libspa_rs(struct spa_latency_info *info, const struct spa_latency_info *other) { return spa_latency_info_combine(info, other); }
int spa_latency_parse_libspa_rs(const struct spa_pod *latency, struct spa_latency_info *info) { return spa_latency_parse(latency, info); }
struct spa_pod * spa_latency_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, const struct spa_latency_info *info) { return spa_latency_build(builder, id, info); }
int spa_process_latency_parse_libspa_rs(const struct spa_pod *latency, struct spa_process_latency_info *info) { return spa_process_latency_parse(latency, info); }
struct spa_pod * spa_process_latency_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, const struct spa_process_latency_info *info) { return spa_process_latency_build(builder, id, info); }
int spa_process_latency_info_add_libspa_rs(const struct spa_process_latency_info *process, struct spa_latency_info *info) { return spa_process_latency_info_add(process, info); }
int spa_format_audio_raw_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_raw *info) { return spa_format_audio_raw_parse(format, info); }
struct spa_pod * spa_format_audio_raw_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_raw *info) { return spa_format_audio_raw_build(builder, id, info); }
int spa_format_audio_dsp_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_dsp *info) { return spa_format_audio_dsp_parse(format, info); }
struct spa_pod * spa_format_audio_dsp_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_dsp *info) { return spa_format_audio_dsp_build(builder, id, info); }
int spa_format_audio_iec958_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_iec958 *info) { return spa_format_audio_iec958_parse(format, info); }
struct spa_pod * spa_format_audio_iec958_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_iec958 *info) { return spa_format_audio_iec958_build(builder, id, info); }
int spa_format_audio_dsd_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_dsd *info) { return spa_format_audio_dsd_parse(format, info); }
struct spa_pod * spa_format_audio_dsd_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_dsd *info) { return spa_format_audio_dsd_build(builder, id, info); }
int spa_format_audio_mp3_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_mp3 *info) { return spa_format_audio_mp3_parse(format, info); }
struct spa_pod * spa_format_audio_mp3_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_mp3 *info) { return spa_format_audio_mp3_build(builder, id, info); }
int spa_format_audio_aac_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_aac *info) { return spa_format_audio_aac_parse(format, info); }
struct spa_pod * spa_format_audio_aac_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_aac *info) { return spa_format_audio_aac_build(builder, id, info); }
int spa_format_audio_vorbis_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_vorbis *info) { return spa_format_audio_vorbis_parse(format, info); }
struct spa_pod * spa_format_audio_vorbis_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_vorbis *info) { return spa_format_audio_vorbis_build(builder, id, info); }
int spa_format_audio_wma_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_wma *info) { return spa_format_audio_wma_parse(format, info); }
struct spa_pod * spa_format_audio_wma_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_wma *info) { return spa_format_audio_wma_build(builder, id, info); }
int spa_format_audio_ra_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_ra *info) { return spa_format_audio_ra_parse(format, info); }
struct spa_pod * spa_format_audio_ra_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_ra *info) { return spa_format_audio_ra_build(builder, id, info); }
int spa_format_audio_amr_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_amr *info) { return spa_format_audio_amr_parse(format, info); }
struct spa_pod * spa_format_audio_amr_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_amr *info) { return spa_format_audio_amr_build(builder, id, info); }
int spa_format_audio_alac_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_alac *info) { return spa_format_audio_alac_parse(format, info); }
struct spa_pod * spa_format_audio_alac_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_alac *info) { return spa_format_audio_alac_build(builder, id, info); }
int spa_format_audio_flac_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_flac *info) { return spa_format_audio_flac_parse(format, info); }
struct spa_pod * spa_format_audio_flac_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_flac *info) { return spa_format_audio_flac_build(builder, id, info); }
int spa_format_audio_ape_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info_ape *info) { return spa_format_audio_ape_parse(format, info); }
struct spa_pod * spa_format_audio_ape_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info_ape *info) { return spa_format_audio_ape_build(builder, id, info); }
int spa_format_audio_parse_libspa_rs(const struct spa_pod *format, struct spa_audio_info *info) { return spa_format_audio_parse(format, info); }
struct spa_pod * spa_format_audio_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_audio_info *info) { return spa_format_audio_build(builder, id, info); }
int spa_format_video_raw_parse_libspa_rs(const struct spa_pod *format, struct spa_video_info_raw *info) { return spa_format_video_raw_parse(format, info); }
struct spa_pod * spa_format_video_raw_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_video_info_raw *info) { return spa_format_video_raw_build(builder, id, info); }
int spa_format_video_dsp_parse_libspa_rs(const struct spa_pod *format, struct spa_video_info_dsp *info) { return spa_format_video_dsp_parse(format, info); }
struct spa_pod * spa_format_video_dsp_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_video_info_dsp *info) { return spa_format_video_dsp_build(builder, id, info); }
int spa_format_video_h264_parse_libspa_rs(const struct spa_pod *format, struct spa_video_info_h264 *info) { return spa_format_video_h264_parse(format, info); }
struct spa_pod * spa_format_video_h264_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_video_info_h264 *info) { return spa_format_video_h264_build(builder, id, info); }
int spa_format_video_mjpg_parse_libspa_rs(const struct spa_pod *format, struct spa_video_info_mjpg *info) { return spa_format_video_mjpg_parse(format, info); }
struct spa_pod * spa_format_video_mjpg_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_video_info_mjpg *info) { return spa_format_video_mjpg_build(builder, id, info); }
int spa_format_video_parse_libspa_rs(const struct spa_pod *format, struct spa_video_info *info) { return spa_format_video_parse(format, info); }
struct spa_pod * spa_format_video_build_libspa_rs(struct spa_pod_builder *builder, uint32_t id, struct spa_video_info *info) { return spa_format_video_build(builder, id, info); }
int spa_pod_compare_value_libspa_rs(uint32_t type, const void *r1, const void *r2, uint32_t size) { return spa_pod_compare_value(type, r1, r2, size); }
int spa_pod_compare_libspa_rs(const struct spa_pod *pod1, const struct spa_pod *pod2) { return spa_pod_compare(pod1, pod2); }
int spa_pod_choice_fix_default_libspa_rs(struct spa_pod_choice *choice) { return spa_pod_choice_fix_default(choice); }
int spa_pod_filter_flags_value_libspa_rs(struct spa_pod_builder *b, uint32_t type, const void *r1, const void *r2, uint32_t size) { return spa_pod_filter_flags_value(b, type, r1, r2, size); }
int spa_pod_filter_is_step_of_libspa_rs(uint32_t type, const void *r1, const void *r2, uint32_t size) { return spa_pod_filter_is_step_of(type, r1, r2, size); }
int spa_pod_filter_prop_libspa_rs(struct spa_pod_builder *b, const struct spa_pod_prop *p1, const struct spa_pod_prop *p2) { return spa_pod_filter_prop(b, p1, p2); }
int spa_pod_filter_part_libspa_rs(struct spa_pod_builder *b, const struct spa_pod *pod, uint32_t pod_size, const struct spa_pod *filter, uint32_t filter_size) { return spa_pod_filter_part(b, pod, pod_size, filter, filter_size); }
int spa_pod_filter_libspa_rs(struct spa_pod_builder *b, struct spa_pod **result, const struct spa_pod *pod, const struct spa_pod *filter) { return spa_pod_filter(b, result, pod, filter); }
struct spa_dbus_connection * spa_dbus_get_connection_libspa_rs(struct spa_dbus *dbus, enum spa_dbus_type type) { return spa_dbus_get_connection(dbus, type); }
const char * spa_i18n_text_libspa_rs(struct spa_i18n *i18n, const char *msgid) { return spa_i18n_text(i18n, msgid); }
const char * spa_i18n_ntext_libspa_rs(struct spa_i18n *i18n, const char *msgid, const char *msgid_plural, unsigned long n) { return spa_i18n_ntext(i18n, msgid, msgid_plural, n); }
void spa_log_topic_init_libspa_rs(struct spa_log *log, struct spa_log_topic *topic) { spa_log_topic_init(log, topic); }
bool spa_log_level_topic_enabled_libspa_rs(const struct spa_log *log, const struct spa_log_topic *topic, enum spa_log_level level) { return spa_log_level_topic_enabled(log, topic, level); }
void spa_log_impl_logtv_libspa_rs(void *object, enum spa_log_level level, const struct spa_log_topic *topic, const char *file, int line, const char *func, const char *fmt, va_list args) { spa_log_impl_logtv(object, level, topic, file, line, func, fmt, args); }
void spa_log_impl_logv_libspa_rs(void *object, enum spa_log_level level, const char *file, int line, const char *func, const char *fmt, va_list args) { spa_log_impl_logv(object, level, file, line, func, fmt, args); }
void spa_log_impl_topic_init_libspa_rs(void *object, struct spa_log_topic *topic) { spa_log_impl_topic_init(object, topic); }
struct spa_handle * spa_plugin_loader_load_libspa_rs(struct spa_plugin_loader *loader, const char *factory_name, const struct spa_dict *info) { return spa_plugin_loader_load(loader, factory_name, info); }
int spa_plugin_loader_unload_libspa_rs(struct spa_plugin_loader *loader, struct spa_handle *handle) { return spa_plugin_loader_unload(loader, handle); }
void * spa_support_find_libspa_rs(const struct spa_support *support, uint32_t n_support, const char *type) { return spa_support_find(support, n_support, type); }
struct spa_thread * spa_thread_utils_create_libspa_rs(struct spa_thread_utils *o, const struct spa_dict *props, void * (*start_routine) (void *), void *arg) { return spa_thread_utils_create(o, props, start_routine, arg); }
int spa_thread_utils_join_libspa_rs(struct spa_thread_utils *o, struct spa_thread *thread, void **retval) { return spa_thread_utils_join(o, thread, retval); }
int spa_thread_utils_get_rt_range_libspa_rs(struct spa_thread_utils *o, const struct spa_dict *props, int *min, int *max) { return spa_thread_utils_get_rt_range(o, props, min, max); }
int spa_thread_utils_acquire_rt_libspa_rs(struct spa_thread_utils *o, struct spa_thread *thread, int priority) { return spa_thread_utils_acquire_rt(o, thread, priority); }
int spa_thread_utils_drop_rt_libspa_rs(struct spa_thread_utils *o, struct spa_thread *thread) { return spa_thread_utils_drop_rt(o, thread); }
void spa_json_init_libspa_rs(struct spa_json *iter, const char *data, size_t size) { spa_json_init(iter, data, size); }
void spa_json_enter_libspa_rs(struct spa_json *iter, struct spa_json *sub) { spa_json_enter(iter, sub); }
int spa_json_next_libspa_rs(struct spa_json *iter, const char **value) { return spa_json_next(iter, value); }
int spa_json_enter_container_libspa_rs(struct spa_json *iter, struct spa_json *sub, char type) { return spa_json_enter_container(iter, sub, type); }
int spa_json_is_container_libspa_rs(const char *val, int len) { return spa_json_is_container(val, len); }
int spa_json_container_len_libspa_rs(struct spa_json *iter, const char *value, int len) { return spa_json_container_len(iter, value, len); }
int spa_json_is_object_libspa_rs(const char *val, int len) { return spa_json_is_object(val, len); }
int spa_json_enter_object_libspa_rs(struct spa_json *iter, struct spa_json *sub) { return spa_json_enter_object(iter, sub); }
bool spa_json_is_array_libspa_rs(const char *val, int len) { return spa_json_is_array(val, len); }
int spa_json_enter_array_libspa_rs(struct spa_json *iter, struct spa_json *sub) { return spa_json_enter_array(iter, sub); }
bool spa_json_is_null_libspa_rs(const char *val, int len) { return spa_json_is_null(val, len); }
int spa_json_parse_float_libspa_rs(const char *val, int len, float *result) { return spa_json_parse_float(val, len, result); }
bool spa_json_is_float_libspa_rs(const char *val, int len) { return spa_json_is_float(val, len); }
int spa_json_get_float_libspa_rs(struct spa_json *iter, float *res) { return spa_json_get_float(iter, res); }
char * spa_json_format_float_libspa_rs(char *str, int size, float val) { return spa_json_format_float(str, size, val); }
int spa_json_parse_int_libspa_rs(const char *val, int len, int *result) { return spa_json_parse_int(val, len, result); }
bool spa_json_is_int_libspa_rs(const char *val, int len) { return spa_json_is_int(val, len); }
int spa_json_get_int_libspa_rs(struct spa_json *iter, int *res) { return spa_json_get_int(iter, res); }
bool spa_json_is_true_libspa_rs(const char *val, int len) { return spa_json_is_true(val, len); }
bool spa_json_is_false_libspa_rs(const char *val, int len) { return spa_json_is_false(val, len); }
bool spa_json_is_bool_libspa_rs(const char *val, int len) { return spa_json_is_bool(val, len); }
int spa_json_parse_bool_libspa_rs(const char *val, int len, bool *result) { return spa_json_parse_bool(val, len, result); }
int spa_json_get_bool_libspa_rs(struct spa_json *iter, bool *res) { return spa_json_get_bool(iter, res); }
bool spa_json_is_string_libspa_rs(const char *val, int len) { return spa_json_is_string(val, len); }
int spa_json_parse_hex_libspa_rs(const char *p, int num, uint32_t *res) { return spa_json_parse_hex(p, num, res); }
int spa_json_parse_stringn_libspa_rs(const char *val, int len, char *result, int maxlen) { return spa_json_parse_stringn(val, len, result, maxlen); }
int spa_json_parse_string_libspa_rs(const char *val, int len, char *result) { return spa_json_parse_string(val, len, result); }
int spa_json_get_string_libspa_rs(struct spa_json *iter, char *res, int maxlen) { return spa_json_get_string(iter, res, maxlen); }
int spa_json_encode_string_libspa_rs(char *str, int size, const char *val) { return spa_json_encode_string(str, size, val); }
void spa_ringbuffer_init_libspa_rs(struct spa_ringbuffer *rbuf) { spa_ringbuffer_init(rbuf); }
void spa_ringbuffer_set_avail_libspa_rs(struct spa_ringbuffer *rbuf, uint32_t size) { spa_ringbuffer_set_avail(rbuf, size); }
int32_t spa_ringbuffer_get_read_index_libspa_rs(struct spa_ringbuffer *rbuf, uint32_t *index) { return spa_ringbuffer_get_read_index(rbuf, index); }
void spa_ringbuffer_read_data_libspa_rs(struct spa_ringbuffer *rbuf, const void *buffer, uint32_t size, uint32_t offset, void *data, uint32_t len) { spa_ringbuffer_read_data(rbuf, buffer, size, offset, data, len); }
void spa_ringbuffer_read_update_libspa_rs(struct spa_ringbuffer *rbuf, int32_t index) { spa_ringbuffer_read_update(rbuf, index); }
int32_t spa_ringbuffer_get_write_index_libspa_rs(struct spa_ringbuffer *rbuf, uint32_t *index) { return spa_ringbuffer_get_write_index(rbuf, index); }
void spa_ringbuffer_write_data_libspa_rs(struct spa_ringbuffer *rbuf, void *buffer, uint32_t size, uint32_t offset, const void *data, uint32_t len) { spa_ringbuffer_write_data(rbuf, buffer, size, offset, data, len); }
void spa_ringbuffer_write_update_libspa_rs(struct spa_ringbuffer *rbuf, int32_t index) { spa_ringbuffer_write_update(rbuf, index); }
