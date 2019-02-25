library(tidyverse)
library(magrittr)

x <- seq(0,1,by = 0.01)

get_beta <- function(shape1, shape2){
  tibble(
    x = x, 
    y = pbeta(x,shape1 = shape1, shape2 = shape2),
    class = glue::glue('{shape1},{shape2}')
  )
}

beta_data <- expand.grid(
  shape1 = 4.5,
  shape2 = seq(0.25, 7, 0.1)
) %$% 
  purrr::map2_df(shape1, shape2, get_beta)


beta_data %>% 
  ggplot(aes(x = x, y = y, color = shape)) +
  geom_line() +
  guides(color = FALSE)


